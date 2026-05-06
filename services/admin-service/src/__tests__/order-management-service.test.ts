import { calculateOrderTotals, deriveOrderStatus, maskDocument, maskEmail, maskPhone } from '../orders/order-management-service';

describe('OrderManagementService helpers', () => {
  it('recalculates totals on the backend shape', () => {
    const totals = calculateOrderTotals({
      items: [
        { quantity: 2, unitPrice: 100, discountTotal: 10, taxTotal: 0 },
        { quantity: 1, unitPrice: 50, discountTotal: 0, taxTotal: 5 },
      ],
      discountTotal: 15,
      shippingTotal: 20,
      feeTotal: 3,
    });

    expect(totals.subtotal).toBe(245);
    expect(totals.total).toBe(253);
    expect(totals.netTotal).toBe(253);
  });

  it('derives operational status from domain statuses', () => {
    expect(
      deriveOrderStatus({
        paymentStatus: 'aprovado',
        stockStatus: 'insuficiente',
        fiscalStatus: 'pendente',
        shippingStatus: 'nao_iniciado',
      })
    ).toBe('aguardando_estoque');

    expect(
      deriveOrderStatus({
        paymentStatus: 'aprovado',
        stockStatus: 'reservado',
        fiscalStatus: 'pendente',
        shippingStatus: 'nao_iniciado',
      })
    ).toBe('aguardando_nota_fiscal');
  });

  it('masks sensitive order data', () => {
    expect(maskEmail('joao.silva@gmail.com')).toBe('jo***@gmail.com');
    expect(maskPhone('(11) 99999-1234')).toBe('(11) *****-1234');
    expect(maskDocument('123.456.789-00')).toBe('***.456.789-**');
    expect(maskDocument('12.345.678/0001-99')).toBe('**.***.***/0001-**');
  });
});
