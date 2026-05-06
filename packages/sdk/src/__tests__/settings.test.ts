import { SettingsModule } from '../settings';
import { T3CKClient } from '../client';

describe('SettingsModule', () => {
  const client = {
    get: jest.fn(),
    put: jest.fn(),
  } as unknown as T3CKClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('get calls API', async () => {
    const settings = new SettingsModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await settings.get();

    expect(client.get).toHaveBeenCalledWith('/settings');
  });

  it('update validates currency type', async () => {
    const settings = new SettingsModule(client);
    await expect(settings.update({ currency: 123 as any })).rejects.toThrow(
      'Currency must be a string'
    );
  });

  it('update validates tax rate', async () => {
    const settings = new SettingsModule(client);
    await expect(settings.update({ taxRate: 2 })).rejects.toThrow(
      'Tax rate must be between 0 and 1'
    );
  });

  it('update validates payment methods', async () => {
    const settings = new SettingsModule(client);
    await expect(settings.update({ paymentMethods: ['card', 123 as any] })).rejects.toThrow(
      'Payment methods must be an array of strings'
    );
  });

  it('update calls API', async () => {
    const settings = new SettingsModule(client);
    (client.put as jest.Mock).mockResolvedValue({});

    await settings.update({ currency: 'BRL' });

    expect(client.put).toHaveBeenCalledWith('/settings', { currency: 'BRL' });
  });

  it('getPaymentMethods calls API', async () => {
    const settings = new SettingsModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await settings.getPaymentMethods();

    expect(client.get).toHaveBeenCalledWith('/settings/payment-methods');
  });

  it('updatePaymentMethods validates array', async () => {
    const settings = new SettingsModule(client);
    await expect(settings.updatePaymentMethods('card' as any)).rejects.toThrow(
      'Payment methods must be an array'
    );
  });

  it('updatePaymentMethods calls API', async () => {
    const settings = new SettingsModule(client);
    (client.put as jest.Mock).mockResolvedValue({});

    await settings.updatePaymentMethods(['card', 'pix']);

    expect(client.put).toHaveBeenCalledWith('/settings/payment-methods', {
      methods: ['card', 'pix'],
    });
  });
});
