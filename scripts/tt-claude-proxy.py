#!/usr/bin/env python3
"""Local OpenAI-compatible shim in front of Amazon Bedrock (Claude).

World Monitor's server LLM helper (server/_shared/llm.ts) speaks the OpenAI
chat-completions wire format through its `generic` provider
(LLM_API_URL / LLM_API_KEY / LLM_MODEL). Bedrock speaks the Converse API and
needs SigV4 signing, so this tiny proxy translates between the two for local
development. Nothing here ships to Vercel; it is a dev helper only.

    /opt/homebrew/bin/python3 scripts/tt-claude-proxy.py            # :8788
    PORT=8790 BEDROCK_MODEL=us.anthropic.claude-opus-5-5 python3 scripts/tt-claude-proxy.py

Env: AWS_PROFILE (default "bedrock"), BEDROCK_REGION (default us-east-1),
BEDROCK_MODEL (default when the request has no model), PORT (default 8788),
BEDROCK_FORWARD_SAMPLING=1 to pass temperature/top_p through (pre-Claude-5 models only).

Endpoints: POST /v1/chat/completions (stream and non-stream), GET /v1/models,
GET /health. Only stdlib + boto3 (Homebrew python has boto3).
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import boto3
    from botocore.config import Config
except ImportError:  # pragma: no cover - environment check
    sys.stderr.write("boto3 is required: /opt/homebrew/bin/python3 -m pip install boto3\n")
    sys.exit(2)

PORT = int(os.environ.get("PORT", "8788"))
REGION = os.environ.get("BEDROCK_REGION", "us-east-1")
PROFILE = os.environ.get("AWS_PROFILE", "bedrock")
DEFAULT_MODEL = os.environ.get("BEDROCK_MODEL", "us.anthropic.claude-sonnet-5")
FORWARD_SAMPLING = os.environ.get("BEDROCK_FORWARD_SAMPLING", "") == "1"
DEBUG = os.environ.get("CLAUDE_PROXY_DEBUG", "") == "1"  # log prompt/response heads to stderr

_session = boto3.Session(profile_name=PROFILE, region_name=REGION)
_client = _session.client(
    "bedrock-runtime",
    config=Config(read_timeout=120, connect_timeout=10, retries={"max_attempts": 2}),
)


def _to_converse(messages: list[dict]) -> tuple[list[dict], list[dict]]:
    """OpenAI messages -> (system blocks, Converse messages).

    Converse requires strict user/assistant alternation and a user first turn;
    consecutive same-role messages are merged and a leading assistant turn gets
    a placeholder user turn.
    """
    system: list[dict] = []
    turns: list[dict] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if isinstance(content, list):  # OpenAI content-part arrays
            content = "\n".join(p.get("text", "") for p in content if isinstance(p, dict))
        text = str(content or "")
        if role == "system":
            if text:
                system.append({"text": text})
            continue
        role = "assistant" if role == "assistant" else "user"
        if turns and turns[-1]["role"] == role:
            turns[-1]["content"][0]["text"] += "\n\n" + text
        else:
            turns.append({"role": role, "content": [{"text": text}]})
    if not turns or turns[0]["role"] != "user":
        turns.insert(0, {"role": "user", "content": [{"text": "(continue)"}]})
    for t in turns:
        if not t["content"][0]["text"].strip():
            t["content"][0]["text"] = "(empty)"
    return system, turns


def _inference_config(body: dict) -> dict:
    cfg: dict = {}
    max_tokens = body.get("max_tokens") or body.get("max_completion_tokens")
    cfg["maxTokens"] = int(max_tokens) if max_tokens else 1024
    # Claude 5 models on Bedrock reject `temperature`/`top_p` ("deprecated for
    # this model"); older Claude accepts them. Forward only when opted in.
    if FORWARD_SAMPLING:
        if body.get("temperature") is not None:
            cfg["temperature"] = float(body["temperature"])
        if body.get("top_p") is not None:
            cfg["topP"] = float(body["top_p"])
    stop = body.get("stop")
    if isinstance(stop, str):
        stop = [stop]
    if stop:
        cfg["stopSequences"] = list(stop)[:4]
    return cfg


class Handler(BaseHTTPRequestHandler):
    server_version = "tt-claude-proxy/1.0"

    def log_message(self, fmt, *args):  # quieter default log
        sys.stderr.write("[claude-proxy] %s\n" % (fmt % args))

    # -- helpers ---------------------------------------------------------
    def _json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def _error(self, status: int, message: str) -> None:
        self._json(status, {"error": {"message": message, "type": "proxy_error"}})

    def _read_body(self) -> bytes:
        """Read the request body with or without Content-Length.

        Node's http client (the sidecar's fetch shim) streams JSON bodies with
        Transfer-Encoding: chunked and no Content-Length; BaseHTTPRequestHandler
        does not decode that, so handle both framings here.
        """
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            chunks = []
            while True:
                size_line = self.rfile.readline().strip()
                if not size_line:
                    break
                size = int(size_line.split(b";")[0], 16)
                if size == 0:
                    # consume trailer lines until the blank line
                    while self.rfile.readline().strip():
                        pass
                    break
                chunks.append(self.rfile.read(size))
                self.rfile.readline()  # CRLF after each chunk
            return b"".join(chunks)
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    # -- routes ----------------------------------------------------------
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path in ("/health", "/"):
            return self._json(200, {"ok": True, "region": REGION, "profile": PROFILE, "default_model": DEFAULT_MODEL})
        if self.path.startswith("/v1/models"):
            return self._json(200, {"object": "list", "data": [{"id": DEFAULT_MODEL, "object": "model", "owned_by": "anthropic-bedrock"}]})
        if self.path.startswith("/v1/chat/completions"):
            # Reachability probes (World Monitor's llm-health GETs the configured URL): answer 200.
            return self._json(200, {"ok": True, "hint": "POST a chat completion to this path"})
        return self._error(404, "not found")

    def do_POST(self):
        if not self.path.startswith("/v1/chat/completions"):
            return self._error(404, "not found")
        try:
            body = json.loads(self._read_body() or b"{}")
        except (ValueError, json.JSONDecodeError) as exc:
            return self._error(400, f"invalid JSON body: {exc}")
        messages = body.get("messages")
        if not isinstance(messages, list) or not messages:
            return self._error(400, "messages[] required")
        model = body.get("model") or DEFAULT_MODEL
        system, turns = _to_converse(messages)
        kwargs = {"modelId": model, "messages": turns, "inferenceConfig": _inference_config(body)}
        if system:
            kwargs["system"] = system
        if body.get("stream"):
            return self._stream(model, kwargs)
        return self._complete(model, kwargs)

    def _complete(self, model: str, kwargs: dict) -> None:
        started = time.time()
        try:
            resp = _client.converse(**kwargs)
        except Exception as exc:  # surface Bedrock errors as OpenAI-style 502
            return self._error(502, f"bedrock converse failed: {exc}")
        text = "".join(block.get("text", "") for block in resp["output"]["message"]["content"])
        usage = resp.get("usage", {})
        if DEBUG:
            head = kwargs["messages"][-1]["content"][0]["text"][:300].replace("\n", " ")
            self.log_message("DEBUG prompt-head: %s", head)
            self.log_message("DEBUG stop=%s response-head: %s", resp.get("stopReason"), text[:400].replace("\n", " "))
        self.log_message("%s %d->%d tokens in %.1fs", model, usage.get("inputTokens", 0), usage.get("outputTokens", 0), time.time() - started)
        self._json(200, {
            "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "length" if resp.get("stopReason") == "max_tokens" else "stop",
            }],
            "usage": {
                "prompt_tokens": usage.get("inputTokens", 0),
                "completion_tokens": usage.get("outputTokens", 0),
                "total_tokens": usage.get("totalTokens", 0),
            },
        })

    def _stream(self, model: str, kwargs: dict) -> None:
        try:
            resp = _client.converse_stream(**kwargs)
        except Exception as exc:
            return self._error(502, f"bedrock converse_stream failed: {exc}")
        cid = f"chatcmpl-{uuid.uuid4().hex[:24]}"
        created = int(time.time())
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        def emit(delta: dict, finish: str | None = None) -> None:
            chunk = {
                "id": cid, "object": "chat.completion.chunk", "created": created, "model": model,
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
            }
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.flush()

        try:
            emit({"role": "assistant", "content": ""})
            for event in resp["stream"]:
                if "contentBlockDelta" in event:
                    text = event["contentBlockDelta"].get("delta", {}).get("text")
                    if text:
                        emit({"content": text})
                elif "messageStop" in event:
                    reason = event["messageStop"].get("stopReason")
                    emit({}, "length" if reason == "max_tokens" else "stop")
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            # Mid-stream failure: the client has a 200 already; end the stream cleanly.
            self.log_message("stream error: %s", exc)
            try:
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except OSError:
                pass


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    sys.stderr.write(f"[claude-proxy] listening on http://127.0.0.1:{PORT}/v1/chat/completions "
                     f"(profile={PROFILE} region={REGION} model={DEFAULT_MODEL})\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
