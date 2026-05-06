import { createFiscalProvider } from '../fiscal/providers';
import { FiscalConfiguration } from '../fiscal/types';

function buildConfig(overrides: Partial<FiscalConfiguration> = {}): FiscalConfiguration {
  return {
    id: 'current',
    tenantId: 'tenant-test',
    legalName: 'Empresa Teste LTDA',
    tradeName: 'Empresa Teste',
    cnpj: '11222333000181',
    stateRegistration: '123456789',
    municipalRegistration: '',
    cnae: '',
    taxRegime: 'simples_nacional',
    taxRegimeCode: '1',
    addressStreet: 'Rua Teste',
    addressNumber: '100',
    addressComplement: '',
    addressNeighborhood: 'Centro',
    addressCity: 'Sao Paulo',
    addressCityCode: '3550308',
    addressState: 'SP',
    addressZipcode: '01001000',
    phone: '11999999999',
    fiscalEmail: 'fiscal@test.local',
    invoiceProvider: 'focus_nfe',
    invoiceEnvironment: 'homologacao',
    nfeEnabled: true,
    nfceEnabled: false,
    nfseEnabled: false,
    nfeSeries: '1',
    nfceSeries: '',
    nfseSeries: '',
    nextNfeNumber: 1,
    nextNfceNumber: 1,
    nextNfseNumber: 1,
    emissionModel: 'backend_provider',
    defaultCfop: '5102',
    defaultNcm: '61091000',
    defaultTaxOrigin: '0',
    defaultOperationNature: 'Venda de mercadoria',
    defaultAdditionalInformation: '',
    nfceCscId: '',
    municipalProviderConfig: {},
    status: 'incompleto',
    validationErrors: [],
    createdBy: 'user-test',
    updatedBy: 'user-test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Fiscal providers', () => {
  it('validates a tenant fiscal configuration for NF-e', async () => {
    const provider = createFiscalProvider('focus_nfe');
    const result = await provider.validateConfig(buildConfig());

    expect(result.valid).toBe(true);
    expect(result.status).toBe('homologacao_ativa');
  });

  it('blocks invalid CNPJ before fiscal issuing', async () => {
    const provider = createFiscalProvider('focus_nfe');
    const result = await provider.validateConfig(buildConfig({ cnpj: '11111111111111' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('CNPJ do emitente invalido.');
  });
});
