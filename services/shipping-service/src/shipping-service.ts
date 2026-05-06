import {
  CarrierCode,
  CarrierIntegrationResult,
  Shipment,
  ShipmentStatus,
  ShippingCalculationInput,
  ShippingNotification,
  ShippingOption,
  TrackingEvent,
} from './types';

const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const now = (): string => new Date().toISOString();

export class ShippingService {
  private readonly shipments = new Map<string, Shipment>();
  private readonly tracking = new Map<string, TrackingEvent[]>();
  private readonly notifications: ShippingNotification[] = [];

  calculateOptions(input: ShippingCalculationInput): ShippingOption[] {
    const volumeWeight =
      (input.dimensionsCm.length * input.dimensionsCm.width * input.dimensionsCm.height) / 6000;
    const billableWeight = Math.max(input.weightKg, volumeWeight);

    const base = 12 + billableWeight * 4;

    return [
      {
        carrier: 'correios',
        serviceLevel: 'economy',
        amount: Number((base * 1).toFixed(2)),
        currency: 'BRL',
        estimatedDays: 7,
      },
      {
        carrier: 'melhor_envio',
        serviceLevel: 'standard',
        amount: Number((base * 1.25).toFixed(2)),
        currency: 'BRL',
        estimatedDays: 4,
      },
      {
        carrier: 'loggi',
        serviceLevel: 'express',
        amount: Number((base * 1.8).toFixed(2)),
        currency: 'BRL',
        estimatedDays: 2,
      },
    ];
  }

  integrateCarrier(
    tenantId: string,
    orderId: string,
    carrier: CarrierCode
  ): CarrierIntegrationResult {
    return {
      carrier,
      success: true,
      externalReference: `${carrier}_${tenantId}_${orderId}_${Date.now()}`,
    };
  }

  createShipment(input: {
    tenantId: string;
    orderId: string;
    carrier: CarrierCode;
    serviceLevel: 'economy' | 'standard' | 'express';
  }): Shipment {
    const timestamp = now();
    const shipment: Shipment = {
      shipmentId: randomId('shp'),
      tenantId: input.tenantId,
      orderId: input.orderId,
      carrier: input.carrier,
      serviceLevel: input.serviceLevel,
      trackingCode: `${input.carrier.toUpperCase()}${Math.floor(Math.random() * 1_000_000_000)}`,
      status: 'created',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.shipments.set(shipment.shipmentId, shipment);
    this.pushTracking(shipment.shipmentId, 'created', 'Shipment criado');
    return shipment;
  }

  generateLabel(tenantId: string, shipmentId: string): { labelUrl: string } {
    const shipment = this.requireShipment(tenantId, shipmentId);
    shipment.labelUrl = `${process.env.SHIPPING_LABEL_BASE_URL || 'https://labels.t3ck.local'}/${shipmentId}.pdf`;
    shipment.status = 'label_generated';
    shipment.updatedAt = now();
    this.shipments.set(shipmentId, shipment);
    this.pushTracking(shipmentId, 'label_generated', 'Etiqueta gerada');
    return { labelUrl: shipment.labelUrl };
  }

  updateTracking(
    tenantId: string,
    shipmentId: string,
    status: ShipmentStatus,
    location?: string,
    message?: string
  ): Shipment {
    const shipment = this.requireShipment(tenantId, shipmentId);
    shipment.status = status;
    shipment.updatedAt = now();
    this.shipments.set(shipmentId, shipment);

    this.pushTracking(shipmentId, status, message, location);
    return shipment;
  }

  getTracking(tenantId: string, shipmentId: string): TrackingEvent[] {
    this.requireShipment(tenantId, shipmentId);
    return (this.tracking.get(shipmentId) || []).sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    );
  }

  sendNotification(input: {
    tenantId: string;
    shipmentId: string;
    channel: 'email' | 'sms' | 'webhook';
    recipient: string;
    message: string;
  }): ShippingNotification {
    this.requireShipment(input.tenantId, input.shipmentId);

    const notification: ShippingNotification = {
      id: randomId('ntf'),
      tenantId: input.tenantId,
      shipmentId: input.shipmentId,
      channel: input.channel,
      recipient: input.recipient,
      message: input.message,
      sentAt: now(),
    };

    this.notifications.push(notification);
    return notification;
  }

  getShipment(tenantId: string, shipmentId: string): Shipment | undefined {
    const value = this.shipments.get(shipmentId);
    if (!value || value.tenantId !== tenantId) {
      return undefined;
    }
    return value;
  }

  listNotifications(tenantId: string, shipmentId?: string): ShippingNotification[] {
    return this.notifications
      .filter(
        (item) => item.tenantId === tenantId && (!shipmentId || item.shipmentId === shipmentId)
      )
      .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
  }

  private pushTracking(
    shipmentId: string,
    status: ShipmentStatus,
    message?: string,
    location?: string
  ): void {
    const list = this.tracking.get(shipmentId) || [];
    list.push({
      shipmentId,
      status,
      message,
      location,
      occurredAt: now(),
    });
    this.tracking.set(shipmentId, list);
  }

  private requireShipment(tenantId: string, shipmentId: string): Shipment {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.tenantId !== tenantId) {
      throw new Error('Shipment não encontrado');
    }
    return shipment;
  }
}
