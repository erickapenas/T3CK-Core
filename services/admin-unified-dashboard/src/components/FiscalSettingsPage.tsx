import { useEffect, useMemo, useState } from 'react';
import {
  adminUnifiedApi,
  FiscalAuditLog,
  FiscalProviderName,
  PublicFiscalConfiguration,
} from '../apiClient';
import '../styles/FiscalSettingsPage.css';

type FiscalSettingsPageProps = {
  tenantId: string;
  onChange?: () => void;
};

const providers: Array<{ value: FiscalProviderName; label: string }> = [
  { value: 'focus_nfe', label: 'Focus NFe' },
  { value: 'nuvem_fiscal', label: 'Nuvem Fiscal' },
  { value: 'plugnotas', label: 'PlugNotas' },
  { value: 'enotas', label: 'eNotas' },
  { value: 'tecnospeed', label: 'TecnoSpeed' },
  { value: 'sefaz_direta', label: 'SEFAZ direta' },
  { value: 'outro', label: 'Outro provedor' },
];

const steps = [
  'Empresa',
  'Emissao',
  'Provedor',
  'Credenciais',
  'Series',
  'Validacao',
];

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    nao_configurado: 'Nao configurado',
    incompleto: 'Incompleto',
    configurado: 'Configurado',
    certificado_invalido: 'Certificado invalido',
    credenciais_invalidas: 'Credenciais invalidas',
    homologacao_ativa: 'Homologacao ativa',
    producao_ativa: 'Producao ativa',
    erro_configuracao: 'Erro de configuracao',
  };
  return labels[status || ''] || status || 'Nao configurado';
}

function emptySecrets() {
  return {
    providerApiKey: '',
    providerClientId: '',
    providerClientSecret: '',
    nfceCsc: '',
    certificatePassword: '',
    municipalUsername: '',
    municipalPassword: '',
  };
}

export function FiscalSettingsPage({ tenantId, onChange }: FiscalSettingsPageProps) {
  const [config, setConfig] = useState<PublicFiscalConfiguration | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [secrets, setSecrets] = useState(emptySecrets());
  const [logs, setLogs] = useState<FiscalAuditLog[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const [settingsRes, logsRes] = await Promise.all([
      adminUnifiedApi.fiscalSettings(tenantId),
      adminUnifiedApi.fiscalAuditLogs(tenantId),
    ]);
    if (settingsRes.success) {
      setConfig(settingsRes.data);
      setForm(settingsRes.data || {});
    } else {
      setError(settingsRes.error || 'Falha ao carregar configuracoes fiscais.');
    }
    if (logsRes.success) {
      setLogs(logsRes.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const completeness = useMemo(() => {
    const required = [
      'legalName',
      'cnpj',
      'taxRegime',
      'addressStreet',
      'addressCity',
      'addressState',
      'addressZipcode',
      'invoiceProvider',
      'invoiceEnvironment',
      'defaultOperationNature',
    ];
    const filled = required.filter((field) => Boolean(form[field]));
    return Math.round((filled.length / required.length) * 100);
  }, [form]);

  const updateField = (field: string, value: any) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateSecret = (field: string, value: string) => {
    setSecrets((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    const payload = {
      ...form,
      ...Object.fromEntries(Object.entries(secrets).filter(([, value]) => Boolean(value))),
    };
    const response = await adminUnifiedApi.saveFiscalSettings(payload, tenantId);
    if (response.success) {
      setConfig(response.data);
      setForm(response.data);
      setSecrets(emptySecrets());
      setSuccess('Configuracao fiscal salva.');
      onChange?.();
      await load();
    } else {
      setError(response.error || 'Falha ao salvar configuracao fiscal.');
    }
    setSaving(false);
  };

  const validate = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    const response = await adminUnifiedApi.validateFiscalSettings(tenantId);
    if (response.success) {
      setConfig(response.data.fiscalConfiguration);
      setForm(response.data.fiscalConfiguration);
      setSuccess(response.data.valid ? 'Configuracao validada.' : 'Validacao concluida com pendencias.');
      await load();
    } else {
      setError(response.error || 'Falha ao validar configuracao.');
    }
    setSaving(false);
  };

  const testProvider = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    const response = await adminUnifiedApi.testFiscalProvider(tenantId);
    if (response.success) {
      setSuccess(response.data.ok ? 'Comunicacao validada.' : 'Teste retornou pendencias.');
    } else {
      setError(response.error || 'Falha no teste com o provedor.');
    }
    setSaving(false);
  };

  const uploadCertificate = async (file?: File | null) => {
    if (!file) return;
    setSaving(true);
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      const encoded = String(reader.result || '').split(',').pop() || '';
      const response = await adminUnifiedApi.uploadCertificate(
        {
          certificateFileBase64: encoded,
          certificateFileName: file.name,
          certificatePassword: secrets.certificatePassword,
        },
        tenantId
      );
      if (response.success) {
        setSuccess('Certificado atualizado.');
        await load();
      } else {
        setError(response.error || 'Falha ao enviar certificado.');
      }
      setSaving(false);
    };
    reader.onerror = () => {
      setError('Falha ao ler certificado.');
      setSaving(false);
    };
    reader.readAsDataURL(file);
  };

  if (loading && !config) {
    return <div className="fiscal-module fiscal-state">Carregando configuracoes fiscais...</div>;
  }

  return (
    <div className="fiscal-module">
      <div className="fiscal-status-grid">
        <article>
          <span>Status</span>
          <strong className={`fiscal-status ${config?.status || 'nao_configurado'}`}>
            {statusLabel(config?.status)}
          </strong>
        </article>
        <article>
          <span>Tenant</span>
          <strong>{tenantId}</strong>
        </article>
        <article>
          <span>Completude</span>
          <strong>{completeness}%</strong>
        </article>
        <article>
          <span>Ambiente</span>
          <strong>{form.invoiceEnvironment || 'homologacao'}</strong>
        </article>
      </div>

      {error && <div className="fiscal-alert">{error}</div>}
      {success && <div className="fiscal-success">{success}</div>}

      <div className="fiscal-wizard">
        <div className="fiscal-steps">
          {steps.map((label, index) => (
            <button
              key={label}
              className={step === index ? 'active' : ''}
              onClick={() => setStep(index)}
              type="button"
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <section className="fiscal-panel">
          {step === 0 && (
            <div className="fiscal-form-grid">
              <label>
                Razao social
                <input value={form.legalName || ''} onChange={(e) => updateField('legalName', e.target.value)} />
              </label>
              <label>
                Nome fantasia
                <input value={form.tradeName || ''} onChange={(e) => updateField('tradeName', e.target.value)} />
              </label>
              <label>
                CNPJ
                <input value={form.cnpj || ''} onChange={(e) => updateField('cnpj', e.target.value)} />
              </label>
              <label>
                Inscricao estadual
                <input value={form.stateRegistration || ''} onChange={(e) => updateField('stateRegistration', e.target.value)} />
              </label>
              <label>
                Inscricao municipal
                <input value={form.municipalRegistration || ''} onChange={(e) => updateField('municipalRegistration', e.target.value)} />
              </label>
              <label>
                CNAE
                <input value={form.cnae || ''} onChange={(e) => updateField('cnae', e.target.value)} />
              </label>
              <label>
                Regime tributario
                <input value={form.taxRegime || ''} onChange={(e) => updateField('taxRegime', e.target.value)} />
              </label>
              <label>
                Codigo do regime
                <input value={form.taxRegimeCode || ''} onChange={(e) => updateField('taxRegimeCode', e.target.value)} />
              </label>
              <label>
                Logradouro
                <input value={form.addressStreet || ''} onChange={(e) => updateField('addressStreet', e.target.value)} />
              </label>
              <label>
                Numero
                <input value={form.addressNumber || ''} onChange={(e) => updateField('addressNumber', e.target.value)} />
              </label>
              <label>
                Bairro
                <input value={form.addressNeighborhood || ''} onChange={(e) => updateField('addressNeighborhood', e.target.value)} />
              </label>
              <label>
                Cidade
                <input value={form.addressCity || ''} onChange={(e) => updateField('addressCity', e.target.value)} />
              </label>
              <label>
                UF
                <input value={form.addressState || ''} maxLength={2} onChange={(e) => updateField('addressState', e.target.value.toUpperCase())} />
              </label>
              <label>
                CEP
                <input value={form.addressZipcode || ''} onChange={(e) => updateField('addressZipcode', e.target.value)} />
              </label>
              <label>
                Telefone
                <input value={form.phone || ''} onChange={(e) => updateField('phone', e.target.value)} />
              </label>
              <label>
                E-mail fiscal
                <input value={form.fiscalEmail || ''} onChange={(e) => updateField('fiscalEmail', e.target.value)} />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="fiscal-form-grid fiscal-compact">
              <label className="fiscal-check">
                <input type="checkbox" checked={Boolean(form.nfeEnabled)} onChange={(e) => updateField('nfeEnabled', e.target.checked)} />
                NF-e
              </label>
              <label className="fiscal-check">
                <input type="checkbox" checked={Boolean(form.nfceEnabled)} onChange={(e) => updateField('nfceEnabled', e.target.checked)} />
                NFC-e
              </label>
              <label className="fiscal-check">
                <input type="checkbox" checked={Boolean(form.nfseEnabled)} onChange={(e) => updateField('nfseEnabled', e.target.checked)} />
                NFS-e
              </label>
              <label>
                Ambiente
                <select value={form.invoiceEnvironment || 'homologacao'} onChange={(e) => updateField('invoiceEnvironment', e.target.value)}>
                  <option value="homologacao">Homologacao</option>
                  <option value="producao">Producao</option>
                </select>
              </label>
              <label>
                Modelo de emissao
                <input value={form.emissionModel || ''} onChange={(e) => updateField('emissionModel', e.target.value)} />
              </label>
              <label>
                Natureza padrao
                <input value={form.defaultOperationNature || ''} onChange={(e) => updateField('defaultOperationNature', e.target.value)} />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="fiscal-form-grid">
              <label>
                Provedor fiscal
                <select value={form.invoiceProvider || ''} onChange={(e) => updateField('invoiceProvider', e.target.value)}>
                  <option value="">Selecione</option>
                  {providers.map((provider) => (
                    <option key={provider.value} value={provider.value}>{provider.label}</option>
                  ))}
                </select>
              </label>
              <label>
                CFOP padrao
                <input value={form.defaultCfop || ''} onChange={(e) => updateField('defaultCfop', e.target.value)} />
              </label>
              <label>
                NCM padrao
                <input value={form.defaultNcm || ''} onChange={(e) => updateField('defaultNcm', e.target.value)} />
              </label>
              <label>
                Origem padrao
                <input value={form.defaultTaxOrigin || ''} onChange={(e) => updateField('defaultTaxOrigin', e.target.value)} />
              </label>
              <label className="fiscal-wide">
                Informacoes complementares
                <textarea value={form.defaultAdditionalInformation || ''} onChange={(e) => updateField('defaultAdditionalInformation', e.target.value)} />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="fiscal-form-grid">
              <label>
                Token/API key
                <input type="password" value={secrets.providerApiKey} placeholder={config?.secrets.hasProviderApiKey ? 'Configurado' : ''} onChange={(e) => updateSecret('providerApiKey', e.target.value)} />
              </label>
              <label>
                Client ID
                <input type="password" value={secrets.providerClientId} placeholder={config?.secrets.hasProviderClientId ? 'Configurado' : ''} onChange={(e) => updateSecret('providerClientId', e.target.value)} />
              </label>
              <label>
                Client Secret
                <input type="password" value={secrets.providerClientSecret} placeholder={config?.secrets.hasProviderClientSecret ? 'Configurado' : ''} onChange={(e) => updateSecret('providerClientSecret', e.target.value)} />
              </label>
              <label>
                Senha certificado
                <input type="password" value={secrets.certificatePassword} placeholder={config?.secrets.hasCertificatePassword ? 'Configurado' : ''} onChange={(e) => updateSecret('certificatePassword', e.target.value)} />
              </label>
              <label>
                Certificado A1
                <input type="file" accept=".pfx,.p12" onChange={(e) => uploadCertificate(e.target.files?.[0])} />
              </label>
              <label>
                ID CSC
                <input value={form.nfceCscId || ''} onChange={(e) => updateField('nfceCscId', e.target.value)} />
              </label>
              <label>
                CSC
                <input type="password" value={secrets.nfceCsc} placeholder={config?.secrets.hasNfceCsc ? 'Configurado' : ''} onChange={(e) => updateSecret('nfceCsc', e.target.value)} />
              </label>
              <label>
                Usuario municipal
                <input type="password" value={secrets.municipalUsername} placeholder={config?.secrets.hasMunicipalUsername ? 'Configurado' : ''} onChange={(e) => updateSecret('municipalUsername', e.target.value)} />
              </label>
              <label>
                Senha municipal
                <input type="password" value={secrets.municipalPassword} placeholder={config?.secrets.hasMunicipalPassword ? 'Configurado' : ''} onChange={(e) => updateSecret('municipalPassword', e.target.value)} />
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="fiscal-form-grid">
              <label>
                Serie NF-e
                <input value={form.nfeSeries || ''} onChange={(e) => updateField('nfeSeries', e.target.value)} />
              </label>
              <label>
                Proximo numero NF-e
                <input type="number" value={form.nextNfeNumber || 1} onChange={(e) => updateField('nextNfeNumber', Number(e.target.value))} />
              </label>
              <label>
                Serie NFC-e
                <input value={form.nfceSeries || ''} onChange={(e) => updateField('nfceSeries', e.target.value)} />
              </label>
              <label>
                Proximo numero NFC-e
                <input type="number" value={form.nextNfceNumber || 1} onChange={(e) => updateField('nextNfceNumber', Number(e.target.value))} />
              </label>
              <label>
                Serie NFS-e
                <input value={form.nfseSeries || ''} onChange={(e) => updateField('nfseSeries', e.target.value)} />
              </label>
              <label>
                Proximo numero NFS-e
                <input type="number" value={form.nextNfseNumber || 1} onChange={(e) => updateField('nextNfseNumber', Number(e.target.value))} />
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="fiscal-validation">
              <div>
                <span>Status atual</span>
                <strong>{statusLabel(config?.status)}</strong>
              </div>
              <div>
                <span>Certificado</span>
                <strong>{config?.secrets.hasCertificate ? 'Enviado' : 'Pendente'}</strong>
              </div>
              <div>
                <span>Token provedor</span>
                <strong>{config?.secrets.hasProviderApiKey ? 'Configurado' : 'Pendente'}</strong>
              </div>
              <div>
                <span>Ultima validacao</span>
                <strong>{config?.lastValidationAt ? new Date(config.lastValidationAt).toLocaleString() : '-'}</strong>
              </div>
              {config?.validationErrors?.length ? (
                <ul className="fiscal-errors">
                  {config.validationErrors.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </div>
          )}

          <div className="fiscal-actions">
            <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Voltar</button>
            <button type="button" onClick={() => setStep(Math.min(steps.length - 1, step + 1))} disabled={step === steps.length - 1}>Avancar</button>
            <button type="button" onClick={save} disabled={saving}>Salvar</button>
            <button type="button" onClick={validate} disabled={saving}>Validar</button>
            <button type="button" onClick={testProvider} disabled={saving}>Testar provedor</button>
          </div>
        </section>
      </div>

      <section className="fiscal-panel">
        <div className="fiscal-panel-head">
          <h3>Auditoria fiscal</h3>
          <span>{logs.length}</span>
        </div>
        <div className="fiscal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Acao</th>
                <th>Campo</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.action}</td>
                  <td>{log.fieldChanged || '-'}</td>
                  <td>{log.newValueMasked || '-'}</td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan={4}>Sem logs fiscais.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
