import { Logger, ValidationError } from '@t3ck/shared';
import { validateEmail, validateTenantId } from '@t3ck/shared/src/validation';

export enum ProvisioningStatus {
  PENDING = 'pending',
  PROVISIONING = 'provisioning',
  ACTIVE = 'active',
  ERROR = 'error',
}

export interface ProvisioningForm {
  tenantId: string;
  companyName: string;
  domain: string;
  contactEmail: string;
  contactName: string;
  contactPhone?: string;
  region?: string;
  plan?: string;
}

export interface Tenant {
  id: string;
  status: ProvisioningStatus;
  form: ProvisioningForm;
  createdAt: string;
  updatedAt: string;
  provisionedAt?: string;
  error?: string;
}

export class ProvisioningFormService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('provisioning-form');
  }

  validateForm(form: Partial<ProvisioningForm>): void {
    const errors: string[] = [];

    // Tenant ID obrigatório e válido
    if (!form.tenantId) {
      errors.push('Tenant ID is required');
    } else if (!validateTenantId(form.tenantId)) {
      errors.push('Tenant ID must be 3-50 alphanumeric characters with hyphens');
    }

    // Company name obrigatório
    if (!form.companyName || form.companyName.trim().length === 0) {
      errors.push('Company name is required');
    } else if (form.companyName.length < 3 || form.companyName.length > 100) {
      errors.push('Company name must be between 3 and 100 characters');
    }

    // Domain obrigatório
    if (!form.domain || form.domain.trim().length === 0) {
      errors.push('Domain is required');
    } else if (!this.validateDomain(form.domain)) {
      errors.push('Domain format is invalid');
    }

    // Contact email obrigatório e válido
    if (!form.contactEmail) {
      errors.push('Contact email is required');
    } else if (!validateEmail(form.contactEmail)) {
      errors.push('Contact email format is invalid');
    }

    // Contact name obrigatório
    if (!form.contactName || form.contactName.trim().length === 0) {
      errors.push('Contact name is required');
    }

    if (errors.length > 0) {
      throw new ValidationError(`Form validation failed: ${errors.join(', ')}`);
    }
  }

  private validateDomain(domain: string): boolean {
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    return domainRegex.test(domain);
  }

  createTenant(form: ProvisioningForm): Tenant {
    const now = new Date().toISOString();

    return {
      id: form.tenantId,
      status: ProvisioningStatus.PENDING,
      form,
      createdAt: now,
      updatedAt: now,
    };
  }

  updateTenantStatus(
    tenant: Tenant,
    status: ProvisioningStatus,
    error?: string
  ): Tenant {
    return {
      ...tenant,
      status,
      updatedAt: new Date().toISOString(),
      ...(status === ProvisioningStatus.ACTIVE && { provisionedAt: new Date().toISOString() }),
      ...(error && { error }),
    };
  }
}
