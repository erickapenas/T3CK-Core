describe('ServiceRegistry - webhook-service', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('registers and stores instance on success', async () => {
    jest.mock('@aws-sdk/client-servicediscovery', () => {
      const sendMock = jest.fn().mockResolvedValue({ OperationId: 'op-123' });
      return {
        ServiceDiscoveryClient: jest.fn().mockImplementation(() => ({ send: sendMock, destroy: jest.fn() })),
        RegisterInstanceCommand: jest.fn(),
        DeregisterInstanceCommand: jest.fn(),
      };
    });

    const { getServiceRegistry } = require('../service-registry');
    const registry = getServiceRegistry();
    const instanceId = await registry.registerInstance('svc-123', 3000, { foo: 'bar' });
    expect(instanceId).toContain('3000');
    const info = registry.getInstanceInfo('svc-123');
    expect(info).toBeDefined();
    expect(info.port).toBe(3000);
  });

  test('deregisters instance and removes from map', async () => {
    jest.resetModules();
    const sendMock = jest.fn().mockResolvedValue({ OperationId: 'op-456' });
    jest.mock('@aws-sdk/client-servicediscovery', () => ({
      ServiceDiscoveryClient: jest.fn().mockImplementation(() => ({ send: sendMock, destroy: jest.fn() })),
      RegisterInstanceCommand: jest.fn(),
      DeregisterInstanceCommand: jest.fn(),
    }));

    const { getServiceRegistry } = require('../service-registry');
    const registry = getServiceRegistry();
    await registry.registerInstance('svc-abc', 4000);
    expect(registry.getInstanceInfo('svc-abc')).toBeDefined();
    await registry.deregisterInstance('svc-abc');
    expect(registry.getInstanceInfo('svc-abc')).toBeUndefined();
  });

  test('registerInstance handles failures gracefully', async () => {
    jest.resetModules();
    const sendMock = jest.fn().mockRejectedValue(new Error('API error'));
    jest.mock('@aws-sdk/client-servicediscovery', () => ({
      ServiceDiscoveryClient: jest.fn().mockImplementation(() => ({ send: sendMock, destroy: jest.fn() })),
      RegisterInstanceCommand: jest.fn(),
      DeregisterInstanceCommand: jest.fn(),
    }));

    const { getServiceRegistry } = require('../service-registry');
    const registry = getServiceRegistry();
    const instanceId = await registry.registerInstance('svc-fail', 5000);
    expect(instanceId).toMatch(/fallback/);
    expect(registry.isAllRegistered()).toBe(false);
  });
});
