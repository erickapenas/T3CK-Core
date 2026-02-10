import { ProvisioningFormService, ProvisioningStatus } from '../provisioning-form';

describe('ProvisioningFormService', () => {
  let service: ProvisioningFormService;

  beforeEach(() => {
    service = new ProvisioningFormService();
  });

  describe('validateForm', () => {
    it('should validate a valid form', () => {
      const validForm = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
        numberOfSeats: 50,
      };

      expect(() => service.validateForm(validForm)).not.toThrow();
    });

    it('should throw error if required field is missing', () => {
      const invalidForm = {
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
      };

      expect(() => service.validateForm(invalidForm)).toThrow();
    });

    it('should throw error for invalid email', () => {
      const invalidForm = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'invalid-email',
        contactName: 'John Doe',
        plan: 'starter',
      };

      expect(() => service.validateForm(invalidForm)).toThrow();
    });

    it('should throw error for invalid domain', () => {
      const invalidForm = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'invalid domain',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
      };

      expect(() => service.validateForm(invalidForm)).toThrow();
    });

    it('should accept numberOfSeats of any positive value', () => {
      const validForm = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
        numberOfSeats: 3,
      };

      expect(() => service.validateForm(validForm)).not.toThrow();
    });
  });

  describe('createTenant', () => {
    it('should create a tenant with PENDING status', () => {
      const form = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
      };

      const tenant = service.createTenant(form);

      expect(tenant.id).toBe('tenant-123');
      expect(tenant.status).toBe(ProvisioningStatus.PENDING);
      expect(tenant.form).toEqual(form);
      expect(tenant.createdAt).toBeDefined();
      expect(tenant.updatedAt).toBeDefined();
      expect(tenant.provisionedAt).toBeUndefined();
    });

    it('should set timestamps on creation', () => {
      const form = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
      };

      const tenant = service.createTenant(form);

      expect(new Date(tenant.createdAt)).toBeInstanceOf(Date);
      expect(new Date(tenant.updatedAt)).toBeInstanceOf(Date);
    });
  });

  describe('updateTenantStatus', () => {
    it('should update tenant status to PROVISIONING', () => {
      const form = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
      };

      const tenant = service.createTenant(form);
      const updated = service.updateTenantStatus(tenant, ProvisioningStatus.PROVISIONING);

      expect(updated.status).toBe(ProvisioningStatus.PROVISIONING);
      expect(updated.provisionedAt).toBeUndefined();
    });

    it('should update tenant status to ACTIVE and set provisionedAt', () => {
      const form = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
      };

      const tenant = service.createTenant(form);
      const updated = service.updateTenantStatus(tenant, ProvisioningStatus.ACTIVE);

      expect(updated.status).toBe(ProvisioningStatus.ACTIVE);
      expect(updated.provisionedAt).toBeDefined();
      expect(new Date(updated.provisionedAt as string)).toBeInstanceOf(Date);
    });

    it('should update tenant status to ERROR and include error message', () => {
      const form = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
      };

      const tenant = service.createTenant(form);
      const errorMsg = 'Provisioning failed due to network error';
      const updated = service.updateTenantStatus(tenant, ProvisioningStatus.ERROR, errorMsg);

      expect(updated.status).toBe(ProvisioningStatus.ERROR);
      expect(updated.error).toBe(errorMsg);
    });

    it('should not set provisionedAt when status is not ACTIVE', () => {
      const form = {
        tenantId: 'tenant-123',
        companyName: 'Test Company',
        domain: 'test.com',
        contactEmail: 'test@example.com',
        contactName: 'John Doe',
        plan: 'starter',
      };

      const tenant = service.createTenant(form);
      const updated = service.updateTenantStatus(tenant, ProvisioningStatus.ERROR);

      expect(updated.provisionedAt).toBeUndefined();
    });
  });
});
