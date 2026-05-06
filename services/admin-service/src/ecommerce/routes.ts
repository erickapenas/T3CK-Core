import { Router, Request, Response } from 'express';
import type {
  AnalyticsPeriod,
  CarrierIntegrationConfig,
  Coupon,
  CRMCustomerRecord,
  CustomerAddress,
  CustomerBehaviorSignal,
  CustomerInteractionEvent,
  CustomerCart,
  CustomerRecoveryProfile,
  CustomerSegment,
  CustomerTimelineEvent,
  LegalAcceptanceRecord,
  InvoicePayload,
  CarrierQuoteRequest,
  ShippingTableRule,
  StoreLegalProfileInput,
  TaxRule,
  WishlistItem,
} from '@t3ck/shared';
import { FirebaseBootstrapService } from './firebase-bootstrap';
import { getEcommerceRuntime } from './runtime';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const randomId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const body = (req: Request): Record<string, unknown> =>
  typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};

const requireStoreId = (req: Request): string => {
  const payload = body(req);
  const storeId = String(
    req.headers['x-store-id'] ||
      req.headers['x-tenant-id'] ||
      req.query.storeId ||
      req.query.tenantId ||
      payload.storeId ||
      payload.tenantId ||
      ''
  );

  if (!storeId) {
    throw new Error('storeId is required (x-store-id, x-tenant-id, query or body)');
  }

  return storeId;
};

const dateValue = (value: unknown, fallback: Date): Date => {
  const parsed = value ? new Date(String(value)) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asyncRoute =
  (handler: AsyncHandler) =>
  (req: Request, res: Response): void => {
    handler(req, res).catch((error) => {
      const message = (error as Error).message;
      const status =
        message.includes('not found') || message.includes('nao encontrado') ? 404 : 400;
      res.status(status).json({ error: message });
    });
  };

export function createEcommerceRouter(): Router {
  const router = Router();
  const runtime = getEcommerceRuntime();
  const bootstrap = new FirebaseBootstrapService();

  router.get(
    '/',
    asyncRoute(async (_req, res) => {
      res.json({
        data: {
          modules: [
            'chatbot',
            'personalization',
            'cart-recovery',
            'coupon-shipping',
            'analytics',
            'crm',
            'portal',
            'tax',
            'legal',
          ],
        },
      });
    })
  );

  router.post(
    '/bootstrap',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await bootstrap.bootstrapStore({
        storeId: String(payload.storeId ?? payload.tenantId ?? ''),
        storeName: String(payload.storeName ?? payload.name ?? 'T3CK Store'),
        tenantId: String(payload.tenantId ?? payload.storeId ?? ''),
        currency: payload.currency ? String(payload.currency) : undefined,
        locale: payload.locale ? String(payload.locale) : undefined,
        timezone: payload.timezone ? String(payload.timezone) : undefined,
        bootstrapBy: payload.bootstrapBy ? String(payload.bootstrapBy) : undefined,
      });
      res.status(201).json({ data });
    })
  );

  router.get(
    '/chat/:sessionId/widget',
    asyncRoute(async (req, res) => {
      const data = await runtime.chatbot.getInitialWidgetState(
        requireStoreId(req),
        req.params.sessionId
      );
      res.json({ data });
    })
  );

  router.post(
    '/chat/:sessionId/messages',
    asyncRoute(async (req, res) => {
      const data = await runtime.chatbot.receiveMessage(
        requireStoreId(req),
        req.params.sessionId,
        String(body(req).message ?? body(req).userMessage ?? '')
      );
      res.status(201).json({ data });
    })
  );

  router.post(
    '/chat/:sessionId/handoff',
    asyncRoute(async (req, res) => {
      await runtime.chatbot.requestHumanHandoff({
        storeId: requireStoreId(req),
        sessionId: req.params.sessionId,
        reason: String(body(req).reason ?? 'Solicitado pelo cliente.'),
        lastCustomerMessage: String(body(req).lastCustomerMessage ?? ''),
      });
      res.status(202).json({ data: { accepted: true } });
    })
  );

  router.post(
    '/personalization/interactions',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      await runtime.personalization.trackInteraction({
        storeId: requireStoreId(req),
        customerId: String(payload.customerId ?? ''),
        productId: String(payload.productId ?? ''),
        type: String(payload.type ?? 'view') as CustomerInteractionEvent['type'],
        createdAt: dateValue(payload.createdAt, new Date()),
      });
      res.status(202).json({ data: { accepted: true } });
    })
  );

  router.get(
    '/personalization/:customerId',
    asyncRoute(async (req, res) => {
      const data = await runtime.personalization.buildPersonalizedExperience(
        requireStoreId(req),
        req.params.customerId
      );
      res.json({ data });
    })
  );

  router.post(
    '/personalization/:customerId/enrichment',
    asyncRoute(async (req, res) => {
      const data = await runtime.personalization.processProfileEnrichmentJob(
        requireStoreId(req),
        req.params.customerId
      );
      res.status(202).json({ data });
    })
  );

  router.post(
    '/carts',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const storeId = requireStoreId(req);
      const data = await runtime.repositories.getCartRepository().createCart({
        ...(payload as unknown as CustomerCart),
        storeId,
        cartId: String(payload.cartId ?? randomId('cart')),
        updatedAt: dateValue(payload.updatedAt, new Date()),
        status: String(payload.status ?? 'active') as CustomerCart['status'],
      });
      res.status(201).json({ data });
    })
  );

  router.post(
    '/recovery/profiles',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const storeId = requireStoreId(req);
      const data = await runtime.repositories.getCustomerRecoveryRepository().saveCustomerProfile({
        ...(payload as unknown as CustomerRecoveryProfile),
        storeId,
        customerId: String(payload.customerId ?? ''),
        lastViewedCategories: Array.isArray(payload.lastViewedCategories)
          ? payload.lastViewedCategories.map(String)
          : [],
        lastViewedProductIds: Array.isArray(payload.lastViewedProductIds)
          ? payload.lastViewedProductIds.map(String)
          : [],
        previousPurchases: Array.isArray(payload.previousPurchases)
          ? payload.previousPurchases.map(String)
          : [],
      });
      res.status(201).json({ data });
    })
  );

  router.post(
    '/recovery/signals',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      await runtime.cartRecovery.registerBehaviorSignal({
        ...(payload as unknown as CustomerBehaviorSignal),
        storeId: requireStoreId(req),
        signalId: String(payload.signalId ?? randomId('signal')),
        createdAt: dateValue(payload.createdAt, new Date()),
      });
      res.status(202).json({ data: { accepted: true } });
    })
  );

  router.post(
    '/recovery/live/:cartId',
    asyncRoute(async (req, res) => {
      const data = await runtime.cartRecovery.evaluateLiveRecoveryOpportunity(
        requireStoreId(req),
        req.params.cartId,
        new Date()
      );
      res.json({ data });
    })
  );

  router.post(
    '/recovery/process',
    asyncRoute(async (req, res) => {
      const data = await runtime.cartRecovery.processAbandonedCarts(
        requireStoreId(req),
        new Date()
      );
      res.status(202).json({ data });
    })
  );

  router.get(
    '/coupons',
    asyncRoute(async (req, res) => {
      const data = await runtime.couponShipping.listCoupons(requireStoreId(req));
      res.json({ data });
    })
  );

  router.post(
    '/coupons',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const storeId = requireStoreId(req);
      const data = await runtime.couponShipping.createCoupon({
        ...(payload as unknown as Coupon),
        id: String(payload.id ?? randomId('coupon')),
        storeId,
        startsAt: dateValue(payload.startsAt, new Date()),
        expiresAt: payload.expiresAt ? dateValue(payload.expiresAt, new Date()) : undefined,
        usageCount: numberValue(payload.usageCount),
      });
      res.status(201).json({ data });
    })
  );

  router.put(
    '/coupons/:couponId',
    asyncRoute(async (req, res) => {
      const data = await runtime.couponShipping.updateCoupon(
        requireStoreId(req),
        req.params.couponId,
        body(req) as Partial<Coupon>
      );
      res.json({ data });
    })
  );

  router.delete(
    '/coupons/:couponId',
    asyncRoute(async (req, res) => {
      await runtime.couponShipping.deleteCoupon(requireStoreId(req), req.params.couponId);
      res.status(204).send();
    })
  );

  router.post(
    '/coupons/apply',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const couponCodes = Array.isArray(payload.couponCodes)
        ? payload.couponCodes.map(String)
        : [String(payload.couponCode ?? '')].filter(Boolean);
      const data =
        couponCodes.length > 1
          ? await runtime.couponShipping.applyCoupons({
              storeId: requireStoreId(req),
              couponCodes,
              orderValue: numberValue(payload.orderValue),
              productIds: Array.isArray(payload.productIds) ? payload.productIds.map(String) : [],
              categoryIds: Array.isArray(payload.categoryIds)
                ? payload.categoryIds.map(String)
                : [],
            })
          : await runtime.couponShipping.applyCoupon({
              storeId: requireStoreId(req),
              couponCode: couponCodes[0] ?? '',
              orderValue: numberValue(payload.orderValue),
              productIds: Array.isArray(payload.productIds) ? payload.productIds.map(String) : [],
              categoryIds: Array.isArray(payload.categoryIds)
                ? payload.categoryIds.map(String)
                : [],
            });
      res.json({ data });
    })
  );

  router.get(
    '/shipping/rules',
    asyncRoute(async (req, res) => {
      const data = await runtime.couponShipping.listShippingRules(requireStoreId(req));
      res.json({ data });
    })
  );

  router.post(
    '/shipping/rules',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.couponShipping.createShippingRule({
        ...(payload as unknown as ShippingTableRule),
        id: String(payload.id ?? randomId('ship_rule')),
        storeId: requireStoreId(req),
      });
      res.status(201).json({ data });
    })
  );

  router.post(
    '/shipping/carriers',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.couponShipping.createCarrierConfig({
        ...(payload as unknown as CarrierIntegrationConfig),
        id: String(payload.id ?? randomId('carrier')),
        storeId: requireStoreId(req),
      });
      res.status(201).json({ data });
    })
  );

  router.get(
    '/shipping/carriers',
    asyncRoute(async (req, res) => {
      const data = await runtime.couponShipping.listActiveCarrierConfigs(requireStoreId(req));
      res.json({ data });
    })
  );

  router.post(
    '/shipping/simulate',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.couponShipping.simulateShipping({
        ...(payload as unknown as CarrierQuoteRequest),
        storeId: requireStoreId(req),
      });
      res.json({ data });
    })
  );

  router.get(
    '/analytics/dashboard',
    asyncRoute(async (req, res) => {
      const endDate = dateValue(req.query.endDate, new Date());
      const startDate = dateValue(req.query.startDate, new Date(endDate.getTime() - 30 * 86400000));
      const data = await runtime.analytics.buildDashboard({
        storeId: requireStoreId(req),
        period: String(req.query.period ?? 'day') as AnalyticsPeriod,
        startDate,
        endDate,
      });
      res.json({ data });
    })
  );

  router.post(
    '/analytics/reports',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const endDate = dateValue(payload.endDate, new Date());
      const startDate = dateValue(payload.startDate, new Date(endDate.getTime() - 30 * 86400000));
      const data = await runtime.analytics.generateSalesReport({
        filter: {
          storeId: requireStoreId(req),
          period: String(payload.period ?? 'day') as AnalyticsPeriod,
          startDate,
          endDate,
        },
        generatedBy: payload.generatedBy ? String(payload.generatedBy) : undefined,
        notes: payload.notes ? String(payload.notes) : undefined,
      });
      res.status(201).json({ data });
    })
  );

  router.get(
    '/analytics/reports',
    asyncRoute(async (req, res) => {
      const data = await runtime.analytics.listSalesReports(requireStoreId(req));
      res.json({ data });
    })
  );

  router.post(
    '/analytics/reports/:reportId/pdf',
    asyncRoute(async (req, res) => {
      const data = await runtime.analytics.exportSalesReportPdf(
        requireStoreId(req),
        req.params.reportId
      );
      res.status(202).json({ data });
    })
  );

  router.get(
    '/crm/customers',
    asyncRoute(async (req, res) => {
      const data = await runtime.crm.listCustomers(requireStoreId(req));
      res.json({ data });
    })
  );

  router.post(
    '/crm/customers',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.crm.createCustomer({
        ...(payload as unknown as CRMCustomerRecord),
        storeId: requireStoreId(req),
        customerId: String(payload.customerId ?? randomId('crm_customer')),
        createdAt: dateValue(payload.createdAt, new Date()),
        updatedAt: dateValue(payload.updatedAt, new Date()),
      });
      res.status(201).json({ data });
    })
  );

  router.get(
    '/crm/customers/:customerId',
    asyncRoute(async (req, res) => {
      const data = await runtime.crm.getCustomer(requireStoreId(req), req.params.customerId);
      res.json({ data });
    })
  );

  router.put(
    '/crm/customers/:customerId',
    asyncRoute(async (req, res) => {
      const data = await runtime.crm.updateCustomer(
        requireStoreId(req),
        req.params.customerId,
        body(req) as Partial<CRMCustomerRecord>
      );
      res.json({ data });
    })
  );

  router.post(
    '/crm/customers/:customerId/timeline',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.crm.addTimelineEvent({
        ...(payload as unknown as CustomerTimelineEvent),
        id: String(payload.id ?? randomId('timeline')),
        storeId: requireStoreId(req),
        customerId: req.params.customerId,
        createdAt: dateValue(payload.createdAt, new Date()),
      });
      res.status(201).json({ data });
    })
  );

  router.get(
    '/crm/segments',
    asyncRoute(async (req, res) => {
      const data = await runtime.crm.listSegments(requireStoreId(req));
      res.json({ data });
    })
  );

  router.post(
    '/crm/segments',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.crm.createSegment({
        ...(payload as unknown as CustomerSegment),
        id: String(payload.id ?? randomId('segment')),
        storeId: requireStoreId(req),
      });
      res.status(201).json({ data });
    })
  );

  router.post(
    '/crm/segments/refresh',
    asyncRoute(async (req, res) => {
      const data = await runtime.crm.refreshCustomerSegments(requireStoreId(req));
      res.status(202).json({ data });
    })
  );

  router.post(
    '/crm/campaigns',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.crm.createCampaignRecord({
        name: String(payload.name ?? 'Campanha'),
        segmentIds: Array.isArray(payload.segmentIds) ? payload.segmentIds.map(String) : [],
        subject: String(payload.subject ?? ''),
        previewText: payload.previewText ? String(payload.previewText) : undefined,
        body: String(payload.body ?? ''),
        scheduledAt: payload.scheduledAt ? dateValue(payload.scheduledAt, new Date()) : undefined,
        storeId: requireStoreId(req),
      });
      res.status(201).json({ data });
    })
  );

  router.get(
    '/portal/:customerId/summary',
    asyncRoute(async (req, res) => {
      const data = await runtime.portal.getPortalSummary(
        requireStoreId(req),
        req.params.customerId
      );
      res.json({ data });
    })
  );

  router.get(
    '/portal/:customerId/orders',
    asyncRoute(async (req, res) => {
      const data = await runtime.portal.getOrderHistory(
        requireStoreId(req),
        req.params.customerId,
        {
          limit: req.query.limit ? numberValue(req.query.limit, 10) : undefined,
          cursor: req.query.cursor ? String(req.query.cursor) : undefined,
        }
      );
      res.json({ data });
    })
  );

  router.get(
    '/portal/:customerId/orders/:orderId',
    asyncRoute(async (req, res) => {
      const data = await runtime.portal.getOrderTracking(
        requireStoreId(req),
        req.params.customerId,
        req.params.orderId
      );
      res.json({ data });
    })
  );

  router.post(
    '/portal/:customerId/orders/:orderId/cancel',
    asyncRoute(async (req, res) => {
      const data = await runtime.portal.cancelOrder({
        storeId: requireStoreId(req),
        customerId: req.params.customerId,
        orderId: req.params.orderId,
        reason: body(req).reason ? String(body(req).reason) : undefined,
      });
      res.json({ data });
    })
  );

  router.post(
    '/portal/:customerId/addresses',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.portal.addAddress({
        ...(payload as unknown as CustomerAddress),
        addressId: String(payload.addressId ?? randomId('addr')),
        storeId: requireStoreId(req),
        customerId: req.params.customerId,
        createdAt: dateValue(payload.createdAt, new Date()),
        updatedAt: dateValue(payload.updatedAt, new Date()),
      });
      res.status(201).json({ data });
    })
  );

  router.get(
    '/portal/:customerId/addresses',
    asyncRoute(async (req, res) => {
      const data = await runtime.portal.listAddresses(requireStoreId(req), req.params.customerId);
      res.json({ data });
    })
  );

  router.post(
    '/portal/:customerId/wishlist',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.portal.addWishlistItem({
        ...(payload as unknown as WishlistItem),
        wishlistItemId: String(payload.wishlistItemId ?? randomId('wish')),
        storeId: requireStoreId(req),
        customerId: req.params.customerId,
        createdAt: dateValue(payload.createdAt, new Date()),
      });
      res.status(201).json({ data });
    })
  );

  router.get(
    '/portal/:customerId/wishlist',
    asyncRoute(async (req, res) => {
      const data = await runtime.portal.listWishlistItems(
        requireStoreId(req),
        req.params.customerId
      );
      res.json({ data });
    })
  );

  router.get(
    '/tax/rules',
    asyncRoute(async (req, res) => {
      const data = await runtime.tax.listTaxRules(requireStoreId(req));
      res.json({ data });
    })
  );

  router.post(
    '/tax/rules',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.tax.createTaxRule({
        ...(payload as unknown as TaxRule),
        id: String(payload.id ?? randomId('tax')),
        storeId: requireStoreId(req),
      });
      res.status(201).json({ data });
    })
  );

  router.post(
    '/tax/validate',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.tax.validateCheckoutTaxes({
        storeId: requireStoreId(req),
        items: Array.isArray(payload.items) ? (payload.items as never) : [],
      });
      res.json({ data });
    })
  );

  router.post(
    '/tax/invoices',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      const data = await runtime.tax.issueInvoice({
        ...(payload as unknown as InvoicePayload),
        storeId: requireStoreId(req),
      });
      res.status(202).json({ data });
    })
  );

  router.get(
    '/legal/profile',
    asyncRoute(async (req, res) => {
      const data = await runtime.legal.getProfile(requireStoreId(req));
      res.json({ data });
    })
  );

  router.put(
    '/legal/profile',
    asyncRoute(async (req, res) => {
      const storeId = requireStoreId(req);
      const existing = await runtime.legal.getProfile(storeId);
      const data = existing
        ? await runtime.legal.updateProfile(storeId, body(req) as Partial<StoreLegalProfileInput>)
        : await runtime.legal.saveProfile({
            ...(body(req) as unknown as StoreLegalProfileInput),
            storeId,
          });
      res.json({ data });
    })
  );

  router.post(
    '/legal/documents/generate',
    asyncRoute(async (req, res) => {
      const data = await runtime.legal.generateDocuments(requireStoreId(req));
      res.status(201).json({ data });
    })
  );

  router.get(
    '/legal/documents',
    asyncRoute(async (req, res) => {
      const data = await runtime.legal.getGeneratedDocuments(requireStoreId(req));
      res.json({ data });
    })
  );

  router.post(
    '/legal/documents/:type/publish',
    asyncRoute(async (req, res) => {
      await runtime.legal.publishDocument({
        storeId: requireStoreId(req),
        type: req.params.type as 'terms-of-use' | 'privacy-policy' | 'exchange-policy',
        version: String(body(req).version ?? ''),
        review: {
          approved: Boolean(body(req).approved),
          reviewedBy: body(req).reviewedBy ? String(body(req).reviewedBy) : undefined,
          notes: body(req).notes ? String(body(req).notes) : undefined,
        },
      });
      res.status(202).json({ data: { published: true } });
    })
  );

  router.post(
    '/legal/acceptances',
    asyncRoute(async (req, res) => {
      const payload = body(req);
      await runtime.legal.registerAcceptance({
        ...(payload as unknown as LegalAcceptanceRecord),
        storeId: requireStoreId(req),
        acceptedAt: dateValue(payload.acceptedAt, new Date()),
      });
      res.status(201).json({ data: { accepted: true } });
    })
  );

  return router;
}
