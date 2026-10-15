import type { Sector, Commodity, MarketSymbol } from '@/types';
import cryptoConfig from '../../shared/crypto.json';
import sectorConfig from '../../shared/sectors.json';
import commodityConfig from '../../shared/commodities.json';
import stocksConfig from '../../shared/stocks.json';
import { SITE_VARIANT } from './variant';

export const SECTORS: Sector[] = sectorConfig.sectors as Sector[];

export const COMMODITIES: Commodity[] = commodityConfig.commodities as Commodity[];

// AI compute / semiconductor variant (chips): the tape tracks the accelerator,
// memory, foundry, tooling and hyperscaler names instead of the global default.
const CHIPS_SYMBOLS: MarketSymbol[] = [
  { symbol: '^SOX', name: 'PHLX Semiconductor', display: 'SOX' },
  { symbol: '^IXIC', name: 'NASDAQ', display: 'NDX' },
  { symbol: 'NVDA', name: 'NVIDIA', display: 'NVDA' },
  { symbol: 'AMD', name: 'AMD', display: 'AMD' },
  { symbol: 'INTC', name: 'Intel', display: 'INTC' },
  { symbol: 'TSM', name: 'TSMC', display: 'TSM' },
  { symbol: 'ASML', name: 'ASML', display: 'ASML' },
  { symbol: 'AVGO', name: 'Broadcom', display: 'AVGO' },
  { symbol: 'MU', name: 'Micron', display: 'MU' },
  { symbol: 'QCOM', name: 'Qualcomm', display: 'QCOM' },
  { symbol: 'ARM', name: 'Arm Holdings', display: 'ARM' },
  { symbol: 'MRVL', name: 'Marvell', display: 'MRVL' },
  { symbol: 'AMAT', name: 'Applied Materials', display: 'AMAT' },
  { symbol: 'LRCX', name: 'Lam Research', display: 'LRCX' },
  { symbol: 'KLAC', name: 'KLA', display: 'KLAC' },
  { symbol: 'SMCI', name: 'Super Micro', display: 'SMCI' },
  { symbol: 'DELL', name: 'Dell', display: 'DELL' },
  { symbol: 'VRT', name: 'Vertiv', display: 'VRT' },
  { symbol: 'MSFT', name: 'Microsoft', display: 'MSFT' },
  { symbol: 'GOOGL', name: 'Alphabet', display: 'GOOGL' },
  { symbol: 'AMZN', name: 'Amazon', display: 'AMZN' },
  { symbol: 'META', name: 'Meta', display: 'META' },
  { symbol: 'ORCL', name: 'Oracle', display: 'ORCL' },
];

export const MARKET_SYMBOLS: MarketSymbol[] = SITE_VARIANT === 'chips'
  ? CHIPS_SYMBOLS
  : (stocksConfig.symbols as MarketSymbol[]);

export const CRYPTO_IDS = cryptoConfig.ids as readonly string[];
export const CRYPTO_MAP: Record<string, { name: string; symbol: string }> = cryptoConfig.meta;
