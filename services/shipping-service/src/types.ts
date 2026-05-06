export type CarrierCode = 'correios' | 'loggi' | 'melhor_envio';

export type ShipmentStatus =
  | 'created'
  | 'label_generated'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered';

export interface ShippingCalculationInput {
  tenantId: string;
  orderId: string;
  destinationZip: string;
  weightKg: number;
  dimensionsCm: {
    length: number;
    width: number;
    height: number;
  };
}

export interface ShippingOption {
  carrier: CarrierCode;
  serviceLevel: 'economy' | 'standard' | 'express';
  amount: number;
  currency: string;
  estimatedDays: number;
}

export interface Shipment {
  shipmentId: string;
  tenantId: string;
  orderId: string;
  carrier: CarrierCode;
  serviceLevel: 'economy' | 'standard' | 'express';
  trackingCode: string;
  status: ShipmentStatus;
  labelUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingEvent {
  shipmentId: string;
  status: ShipmentStatus;
  location?: string;
  occurredAt: string;
  message?: string;
}

export interface ShippingNotification {
  id: string;
  tenantId: string;
  shipmentId: string;
  channel: 'email' | 'sms' | 'webhook';
  recipient: string;
  message: string;
  sentAt: string;
}

export interface CarrierIntegrationResult {
  carrier: CarrierCode;
  success: boolean;
  externalReference: string;
}
