export { BaseProfile, defineProfile, parseRawBytes } from './base';
export { deriveOptionalServices } from './services';
export type { OptionalServicesSource, ProfileWithServices } from './services';
export { HeartRateProfile, parseHeartRate, HEART_RATE_SERVICES } from './heart-rate';
export type { HeartRateData } from './heart-rate';
export { BatteryProfile } from './battery';
export { DeviceInfoProfile } from './device-info';
export type { DeviceInfo } from './device-info';
export { NordicUARTProfile, NUS_SERVICES } from './nordic-uart';
export { HM10SerialProfile } from './serial-ffe0';
/**
 * @experimental Storz & Bickel (Crafty/Mighty) profile — UUIDs from PUBLIC
 * reverse-engineering, standard-validated (Web Bluetooth Living Standard §4/§6/§7),
 * on-device deferred to operator. See ./storz-bickel.
 */
export {
  StorzBickelProfile,
  decodeTemperatureDeciCelsius,
  encodeTemperatureDeciCelsius,
  decodeBatteryPercent,
  STORZ_BICKEL_SERVICE,
  STORZ_BICKEL_CHARACTERISTICS,
  STORZ_BICKEL_SERVICE_2,
  STORZ_BICKEL_SERVICE_3,
  STORZ_BICKEL_SERVICE_2_CHARACTERISTICS,
  STORZ_BICKEL_SERVICE_3_CHARACTERISTICS,
  STORZ_BICKEL_AUTH_GATE,
  STORZ_BICKEL_SERVICES,
  STORZ_BICKEL_VOLCANO_SERVICES,
  STORZ_BICKEL_VEAZY_VENTY_SERVICES,
  STORZ_BICKEL_FAMILY_SERVICES,
  StorzBickel,
} from './storz-bickel';
