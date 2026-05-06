// Este modulo atende a area logada do cliente com foco em leitura leve e paginada.
// A expectativa e plugar esta camada sobre orders/users/products ja existentes no sistema principal.
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'out-for-delivery'
  | 'delivered'
  | 'cancelled';

export interface CustomerOrderTimelineEvent {
  status: OrderStatus;
  label: string;
  description?: string;
  createdAt: Date;
  visualVariant?: 'default' | 'success' | 'warning' | 'info';
  isCustomerVisible?: boolean;
}

export interface CustomerOrderSummary {
  orderId: string;
  storeId: string;
  customerId: string;
  status: OrderStatus;
  totalAmount: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
  estimatedDeliveryDate?: Date;
  trackingCode?: string;
  carrierName?: string;
}

export interface CustomerOrderItemDetails {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl?: string;
}

export interface CustomerOrderFinancialDetails {
  subtotalAmount: number;
  discountAmount: number;
  shippingAmount: number;
  totalAmount: number;
  paymentMethodLabel?: string;
  installmentsLabel?: string;
}

export interface CustomerOrderTrackingDetails {
  trackingCode?: string;
  carrierName?: string;
  carrierTrackingUrl?: string;
  estimatedDeliveryDate?: Date;
  lastTrackingUpdateAt?: Date;
  lastTrackingStatusLabel?: string;
}

export interface CustomerOrderAvailableActions {
  canCancel: boolean;
  canReorder: boolean;
  canRequestSupport: boolean;
  canRequestExchange: boolean;
  canRequestReturn: boolean;
  canDownloadInvoice: boolean;
  canDownloadReceipt: boolean;
  supportLabel?: string;
}

export interface CustomerOrderDocument {
  documentType: 'invoice' | 'receipt';
  label: string;
  downloadUrl?: string;
  issuedAt?: Date;
}

export interface CustomerOrderNotification {
  notificationId: string;
  orderId: string;
  title: string;
  message: string;
  channel: 'portal' | 'email';
  isRead: boolean;
  createdAt: Date;
}

export interface CustomerOrderSupportMessage {
  authorType: 'customer' | 'support';
  message: string;
  createdAt: Date;
}

export interface CustomerOrderSupportTicket {
  ticketId: string;
  orderId: string;
  status: 'open' | 'in-progress' | 'resolved';
  subject: string;
  messages: CustomerOrderSupportMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerExchangeOrReturnRequest {
  requestId: string;
  orderId: string;
  type: 'exchange' | 'return';
  status: 'requested' | 'approved' | 'rejected' | 'processing' | 'completed';
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerOrderDetails extends CustomerOrderSummary {
  timeline: CustomerOrderTimelineEvent[];
  items?: CustomerOrderItemDetails[];
  financialDetails?: CustomerOrderFinancialDetails;
  trackingDetails?: CustomerOrderTrackingDetails;
  shippingAddress?: CustomerAddress;
  availableActions?: CustomerOrderAvailableActions;
  documents?: CustomerOrderDocument[];
  supportTicket?: CustomerOrderSupportTicket | null;
  exchangeOrReturnRequests?: CustomerExchangeOrReturnRequest[];
}

export interface CustomerAddress {
  addressId: string;
  storeId: string;
  customerId: string;
  label: string;
  recipientName: string;
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WishlistItem {
  wishlistItemId: string;
  storeId: string;
  customerId: string;
  productId: string;
  productName: string;
  productPrice: number;
  productImageUrl?: string;
  createdAt: Date;
}

export interface CustomerPortalSummary {
  latestOrders: CustomerOrderSummary[];
  addresses: CustomerAddress[];
  wishlist: WishlistItem[];
}

export interface CustomerPortalQueryOptions {
  limit?: number;
  searchTerm?: string;
  status?: OrderStatus;
  dateFrom?: Date;
  dateTo?: Date;
  cursor?: string;
}

export interface CustomerOrderHistoryResult {
  items: CustomerOrderSummary[];
  appliedFilters: {
    searchTerm?: string;
    status?: OrderStatus;
    dateFrom?: Date;
    dateTo?: Date;
  };
  nextCursor?: string;
  hasMore: boolean;
}

export interface CustomerPortalActionRequest {
  storeId: string;
  customerId: string;
  orderId: string;
  reason?: string;
}

export interface CustomerPortalActionResult {
  orderId: string;
  action: 'cancel' | 'reorder' | 'support' | 'exchange' | 'return';
  success: boolean;
  message: string;
  supportTicketId?: string;
  reorderedCartId?: string;
  exchangeOrReturnRequestId?: string;
}

export interface CustomerPortalPage<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface CustomerSupportRequestInput extends CustomerPortalActionRequest {
  subject: string;
  message: string;
}

export interface CustomerExchangeOrReturnRequestInput extends CustomerPortalActionRequest {
  type: 'exchange' | 'return';
  reason: string;
}

export interface OrderNotificationPayload {
  orderId: string;
  customerId: string;
  customerEmail?: string;
  title: string;
  message: string;
}

export interface OrderNotificationSender {
  // Pode ser implementado com Resend ou outro provedor de email/notificacao.
  sendOrderUpdate(input: OrderNotificationPayload): Promise<void>;
}

export interface CustomerPortalRepository {
  getOrderById(
    storeId: string,
    customerId: string,
    orderId: string
  ): Promise<CustomerOrderDetails | null>;
  listOrders(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<CustomerPortalPage<CustomerOrderSummary>>;
  cancelOrder(request: CustomerPortalActionRequest): Promise<CustomerPortalActionResult>;
  reorderItems(request: CustomerPortalActionRequest): Promise<CustomerPortalActionResult>;
  requestOrderSupport(request: CustomerSupportRequestInput): Promise<CustomerPortalActionResult>;
  requestExchangeOrReturn(
    request: CustomerExchangeOrReturnRequestInput
  ): Promise<CustomerPortalActionResult>;
  listOrderNotifications(
    storeId: string,
    customerId: string,
    orderId: string
  ): Promise<CustomerOrderNotification[]>;
  markOrderNotificationAsRead(
    storeId: string,
    customerId: string,
    notificationId: string
  ): Promise<void>;
  createAddress(address: CustomerAddress): Promise<CustomerAddress>;
  updateAddress(
    storeId: string,
    customerId: string,
    addressId: string,
    data: Partial<CustomerAddress>
  ): Promise<CustomerAddress>;
  deleteAddress(storeId: string, customerId: string, addressId: string): Promise<void>;
  listAddresses(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<CustomerAddress[]>;
  addWishlistItem(item: WishlistItem): Promise<WishlistItem>;
  removeWishlistItem(storeId: string, customerId: string, wishlistItemId: string): Promise<void>;
  listWishlistItems(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<WishlistItem[]>;
}

interface CachedPortalEntry<T> {
  expiresAt: number;
  data: T;
}

export class EcommerceCustomerAccountPortalService {
  // Os limites padrao protegem o mobile e impedem payloads grandes no portal do cliente.
  private static readonly EDGE_LIMIT = 10;
  private static readonly SUMMARY_ORDER_LIMIT = 5;
  private readonly readCache = new Map<string, CachedPortalEntry<unknown>>();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly customerPortalRepository: CustomerPortalRepository,
    private readonly orderNotificationSender?: OrderNotificationSender,
    options?: {
      cacheTtlMs?: number;
    }
  ) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 30000;
  }

  public async getPortalSummary(
    storeId: string,
    customerId: string
  ): Promise<CustomerPortalSummary> {
    // Cache curto melhora a sensacao de velocidade sem manter dados obsoletos por muito tempo.
    const cacheKey = `portal-summary:${storeId}:${customerId}`;
    const cached = this.readCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as CustomerPortalSummary;
    }

    const [latestOrders, addresses, wishlist] = await Promise.all([
      this.customerPortalRepository.listOrders(storeId, customerId, {
        limit: EcommerceCustomerAccountPortalService.SUMMARY_ORDER_LIMIT,
      }),
      this.customerPortalRepository.listAddresses(storeId, customerId, {
        limit: EcommerceCustomerAccountPortalService.EDGE_LIMIT,
      }),
      this.customerPortalRepository.listWishlistItems(storeId, customerId, {
        limit: EcommerceCustomerAccountPortalService.EDGE_LIMIT,
      }),
    ]);

    const summary: CustomerPortalSummary = {
      latestOrders: latestOrders.items,
      addresses,
      wishlist,
    };

    this.readCache.set(cacheKey, {
      data: summary,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return summary;
  }

  public async getOrderTracking(
    storeId: string,
    customerId: string,
    orderId: string
  ): Promise<CustomerOrderDetails | null> {
    // Tracking sempre consulta por ID direto para preservar performance.
    const order = await this.customerPortalRepository.getOrderById(storeId, customerId, orderId);

    if (!order) {
      return null;
    }

    return {
      ...order,
      trackingDetails: order.trackingDetails ?? {
        trackingCode: order.trackingCode,
        carrierName: order.carrierName,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        lastTrackingStatusLabel: order.timeline[order.timeline.length - 1]?.label,
        lastTrackingUpdateAt: order.timeline[order.timeline.length - 1]?.createdAt,
      },
      availableActions: order.availableActions ?? this.buildAvailableActions(order),
    };
  }

  public async getOrderHistory(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<CustomerOrderHistoryResult> {
    const items = await this.customerPortalRepository.listOrders(storeId, customerId, {
      limit: Math.min(
        options?.limit ?? EcommerceCustomerAccountPortalService.EDGE_LIMIT,
        EcommerceCustomerAccountPortalService.EDGE_LIMIT
      ),
      cursor: options?.cursor,
    });

    const filteredItems = items.items.filter((order) => this.matchesOrderFilters(order, options));

    return {
      items: filteredItems,
      appliedFilters: {
        searchTerm: options?.searchTerm,
        status: options?.status,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
      },
      nextCursor: items.nextCursor,
      hasMore: items.hasMore,
    };
  }

  public async cancelOrder(
    request: CustomerPortalActionRequest
  ): Promise<CustomerPortalActionResult> {
    this.invalidateCustomerCache(request.storeId, request.customerId);
    return this.customerPortalRepository.cancelOrder(request);
  }

  public async reorderOrderItems(
    request: CustomerPortalActionRequest
  ): Promise<CustomerPortalActionResult> {
    this.invalidateCustomerCache(request.storeId, request.customerId);
    return this.customerPortalRepository.reorderItems(request);
  }

  public async requestOrderSupport(
    request: CustomerSupportRequestInput
  ): Promise<CustomerPortalActionResult> {
    return this.customerPortalRepository.requestOrderSupport(request);
  }

  public async requestExchangeOrReturn(
    request: CustomerExchangeOrReturnRequestInput
  ): Promise<CustomerPortalActionResult> {
    this.invalidateCustomerCache(request.storeId, request.customerId);
    return this.customerPortalRepository.requestExchangeOrReturn(request);
  }

  public async listOrderNotifications(
    storeId: string,
    customerId: string,
    orderId: string
  ): Promise<CustomerOrderNotification[]> {
    return this.customerPortalRepository.listOrderNotifications(storeId, customerId, orderId);
  }

  public async markOrderNotificationAsRead(
    storeId: string,
    customerId: string,
    notificationId: string
  ): Promise<void> {
    await this.customerPortalRepository.markOrderNotificationAsRead(
      storeId,
      customerId,
      notificationId
    );
  }

  public async notifyOrderUpdate(input: {
    storeId: string;
    customerId: string;
    orderId: string;
    customerEmail?: string;
    title: string;
    message: string;
  }): Promise<void> {
    if (!this.orderNotificationSender) {
      return;
    }

    await this.orderNotificationSender.sendOrderUpdate({
      orderId: input.orderId,
      customerId: input.customerId,
      customerEmail: input.customerEmail,
      title: input.title,
      message: input.message,
    });
  }

  public async addAddress(address: CustomerAddress): Promise<CustomerAddress> {
    this.invalidateCustomerCache(address.storeId, address.customerId);
    return this.customerPortalRepository.createAddress(address);
  }

  public async updateAddress(
    storeId: string,
    customerId: string,
    addressId: string,
    data: Partial<CustomerAddress>
  ): Promise<CustomerAddress> {
    this.invalidateCustomerCache(storeId, customerId);
    return this.customerPortalRepository.updateAddress(storeId, customerId, addressId, data);
  }

  public async removeAddress(
    storeId: string,
    customerId: string,
    addressId: string
  ): Promise<void> {
    this.invalidateCustomerCache(storeId, customerId);
    await this.customerPortalRepository.deleteAddress(storeId, customerId, addressId);
  }

  public async listAddresses(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<CustomerAddress[]> {
    return this.customerPortalRepository.listAddresses(storeId, customerId, {
      limit: Math.min(
        options?.limit ?? EcommerceCustomerAccountPortalService.EDGE_LIMIT,
        EcommerceCustomerAccountPortalService.EDGE_LIMIT
      ),
    });
  }

  public async addWishlistItem(item: WishlistItem): Promise<WishlistItem> {
    this.invalidateCustomerCache(item.storeId, item.customerId);
    return this.customerPortalRepository.addWishlistItem(item);
  }

  public async removeWishlistItem(
    storeId: string,
    customerId: string,
    wishlistItemId: string
  ): Promise<void> {
    this.invalidateCustomerCache(storeId, customerId);
    await this.customerPortalRepository.removeWishlistItem(storeId, customerId, wishlistItemId);
  }

  public async listWishlistItems(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<WishlistItem[]> {
    return this.customerPortalRepository.listWishlistItems(storeId, customerId, {
      limit: Math.min(
        options?.limit ?? EcommerceCustomerAccountPortalService.EDGE_LIMIT,
        EcommerceCustomerAccountPortalService.EDGE_LIMIT
      ),
    });
  }

  private invalidateCustomerCache(storeId: string, customerId: string): void {
    // Escritas em endereco ou wishlist invalidam apenas o resumo daquele cliente.
    const cachePrefix = `portal-summary:${storeId}:${customerId}`;
    this.readCache.delete(cachePrefix);
  }

  private matchesOrderFilters(
    order: CustomerOrderSummary,
    options?: CustomerPortalQueryOptions
  ): boolean {
    if (!options) {
      return true;
    }

    if (options.status && order.status !== options.status) {
      return false;
    }

    if (options.searchTerm) {
      const normalizedSearch = options.searchTerm.trim().toLowerCase();
      const searchableText = [order.orderId, order.carrierName, order.trackingCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!searchableText.includes(normalizedSearch)) {
        return false;
      }
    }

    if (options.dateFrom && order.createdAt < options.dateFrom) {
      return false;
    }

    if (options.dateTo && order.createdAt > options.dateTo) {
      return false;
    }

    return true;
  }

  private buildAvailableActions(order: CustomerOrderDetails): CustomerOrderAvailableActions {
    return {
      canCancel: order.status === 'pending' || order.status === 'paid',
      canReorder: order.status === 'delivered' || order.status === 'cancelled',
      canRequestSupport: true,
      canRequestExchange: order.status === 'delivered',
      canRequestReturn: order.status === 'delivered',
      canDownloadInvoice: true,
      canDownloadReceipt: true,
      supportLabel: 'Preciso de ajuda com este pedido',
    };
  }
}
