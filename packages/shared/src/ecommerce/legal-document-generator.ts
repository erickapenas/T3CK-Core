// Este modulo gera e versiona documentos juridicos por tenant/loja.
// O provider de texto pode ser IA ou outro motor, mas o fluxo de persistencia fica padronizado aqui.
export interface StoreLegalProfileInput {
  storeId: string;
  companyName: string;
  brandName?: string;
  cnpj?: string;
  email: string;
  supportEmail?: string;
  supportPhone?: string;
  websiteUrl: string;
  address?: string;
  returnWindowDays?: number;
  deliveryPolicySummary?: string;
  paymentMethods?: string[];
  collectsPersonalData: boolean;
  sharesDataWithThirdParties: boolean;
  usesCookies: boolean;
  customTermsNotes?: string;
  customPrivacyNotes?: string;
  customExchangeNotes?: string;
}

export interface GeneratedLegalDocument {
  type: 'terms-of-use' | 'privacy-policy' | 'exchange-policy';
  title: string;
  content: string;
  version: string;
  generatedAt: Date;
  status?: 'draft' | 'published';
  templateKey?: string;
}

export interface LegalDocumentsBundle {
  storeId: string;
  documents: GeneratedLegalDocument[];
}

export interface LegalAcceptanceRecord {
  storeId: string;
  customerId: string;
  documentType: GeneratedLegalDocument['type'];
  documentVersion: string;
  acceptedAt: Date;
}

export interface LegalDocumentRepository {
  saveGeneratedDocuments(bundle: LegalDocumentsBundle): Promise<void>;
  getGeneratedDocuments(storeId: string): Promise<LegalDocumentsBundle | null>;
  deleteGeneratedDocument(storeId: string, type: GeneratedLegalDocument['type']): Promise<void>;
  publishGeneratedDocument(
    storeId: string,
    type: GeneratedLegalDocument['type'],
    version: string
  ): Promise<void>;
  saveAcceptanceRecord?(record: LegalAcceptanceRecord): Promise<void>;
}

export interface StoreLegalProfileRepository {
  saveProfile(profile: StoreLegalProfileInput): Promise<StoreLegalProfileInput>;
  getProfile(storeId: string): Promise<StoreLegalProfileInput | null>;
  updateProfile(
    storeId: string,
    data: Partial<StoreLegalProfileInput>
  ): Promise<StoreLegalProfileInput>;
  deleteProfile(storeId: string): Promise<void>;
}

export interface LegalTemplateSelection {
  templateKey: string;
  storeVertical?: string;
  documentType: GeneratedLegalDocument['type'];
}

export interface ManualLegalReview {
  approved: boolean;
  reviewedBy?: string;
  notes?: string;
}

export interface LegalTextGenerator {
  // Este contrato pode ser implementado com OpenAI, Gemini ou outro gerador de texto juridico.
  generate(input: {
    type: GeneratedLegalDocument['type'];
    profile: StoreLegalProfileInput;
  }): Promise<{
    title: string;
    content: string;
  }>;
}

export class EcommerceLegalDocumentGenerator {
  constructor(
    private readonly legalDocumentRepository: LegalDocumentRepository,
    private readonly storeLegalProfileRepository: StoreLegalProfileRepository,
    private readonly legalTextGenerator: LegalTextGenerator
  ) {}

  public async saveProfile(profile: StoreLegalProfileInput): Promise<StoreLegalProfileInput> {
    return this.storeLegalProfileRepository.saveProfile(profile);
  }

  public async updateProfile(
    storeId: string,
    data: Partial<StoreLegalProfileInput>
  ): Promise<StoreLegalProfileInput> {
    return this.storeLegalProfileRepository.updateProfile(storeId, data);
  }

  public async getProfile(storeId: string): Promise<StoreLegalProfileInput | null> {
    return this.storeLegalProfileRepository.getProfile(storeId);
  }

  public async deleteProfile(storeId: string): Promise<void> {
    await this.storeLegalProfileRepository.deleteProfile(storeId);
  }

  public async generateDocuments(storeId: string): Promise<LegalDocumentsBundle> {
    // O perfil da loja e a fonte unica de verdade para todos os documentos gerados.
    const profile = await this.storeLegalProfileRepository.getProfile(storeId);

    if (!profile) {
      throw new Error('Perfil juridico da loja nao encontrado na infraestrutura de dados.');
    }

    const documentTypes: GeneratedLegalDocument['type'][] = [
      'terms-of-use',
      'privacy-policy',
      'exchange-policy',
    ];

    const documents: GeneratedLegalDocument[] = [];

    for (const type of documentTypes) {
      // A geracao separada por tipo facilita reprocessar apenas um documento no futuro.
      const generated = await this.legalTextGenerator.generate({
        type,
        profile,
      });

      documents.push({
        type,
        title: generated.title,
        content: generated.content,
        version: this.buildVersion(),
        generatedAt: new Date(),
        status: 'draft',
      });
    }

    const bundle: LegalDocumentsBundle = {
      storeId: profile.storeId,
      documents,
    };

    await this.legalDocumentRepository.saveGeneratedDocuments(bundle);

    return bundle;
  }

  public async getGeneratedDocuments(storeId: string): Promise<LegalDocumentsBundle | null> {
    return this.legalDocumentRepository.getGeneratedDocuments(storeId);
  }

  public async deleteGeneratedDocument(
    storeId: string,
    type: GeneratedLegalDocument['type']
  ): Promise<void> {
    await this.legalDocumentRepository.deleteGeneratedDocument(storeId, type);
  }

  public async publishDocument(input: {
    storeId: string;
    type: GeneratedLegalDocument['type'];
    version: string;
    review: ManualLegalReview;
  }): Promise<void> {
    if (!input.review.approved) {
      throw new Error('Documento juridico precisa de aprovacao manual antes da publicacao.');
    }

    await this.legalDocumentRepository.publishGeneratedDocument(
      input.storeId,
      input.type,
      input.version
    );
  }

  public async registerAcceptance(input: LegalAcceptanceRecord): Promise<void> {
    await this.legalDocumentRepository.saveAcceptanceRecord?.(input);
  }

  private buildVersion(): string {
    // Versao baseada em data simplifica auditoria e publicacao.
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }
}
