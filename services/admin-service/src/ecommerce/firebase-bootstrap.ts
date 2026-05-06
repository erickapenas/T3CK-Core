import * as admin from 'firebase-admin';
import { getFirestore } from '../firebase';

export interface FirebaseStoreBootstrapInput {
  storeId: string;
  storeName: string;
  tenantId: string;
  currency?: string;
  locale?: string;
  timezone?: string;
  bootstrapBy?: string;
}

export interface FirebaseBootstrapResult {
  storeId: string;
  tenantId: string;
  bootstrappedAt: Date;
  createdDocuments: string[];
  notes: string[];
}

export class FirebaseBootstrapService {
  constructor(private readonly db: admin.firestore.Firestore | null = getFirestore()) {}

  public async bootstrapStore(
    input: FirebaseStoreBootstrapInput
  ): Promise<FirebaseBootstrapResult> {
    const now = new Date();
    const createdDocuments: string[] = [];

    if (!this.db) {
      throw new Error('Firestore is required for store bootstrap');
    }

    await this.db.collection('lojas').doc(input.storeId).set(
      {
        storeId: input.storeId,
        tenantId: input.tenantId,
        name: input.storeName,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    createdDocuments.push(`lojas/${input.storeId}`);

    await this.db
      .collection(`lojas/${input.storeId}/configuracoes`)
      .doc('geral')
      .set(
        {
          tenantId: input.tenantId,
          currency: input.currency ?? 'BRL',
          locale: input.locale ?? 'pt-BR',
          timezone: input.timezone ?? 'America/Sao_Paulo',
          updatedAt: now,
        },
        { merge: true }
      );
    createdDocuments.push(`lojas/${input.storeId}/configuracoes/geral`);

    await this.db
      .collection(`lojas/${input.storeId}/configuracoes`)
      .doc('bootstrap')
      .set(
        {
          tenantId: input.tenantId,
          initializedAt: now,
          initializedBy: input.bootstrapBy ?? 'system',
          expectedCollections: [
            'produtos',
            'categorias',
            'sessoesChat',
            'clientes',
            'carrinhos',
            'cupons',
            'regrasFrete',
            'configuracoesTransportadora',
            'snapshotsAnalytics',
            'relatoriosVendas',
            'pdfsRelatoriosVendas',
            'clientesCrm',
            'segmentosCrm',
            'rascunhosCampanhasEmail',
            'regrasFiscais',
            'notasFiscais',
            'documentosLegais',
          ],
        },
        { merge: true }
      );
    createdDocuments.push(`lojas/${input.storeId}/configuracoes/bootstrap`);

    await this.db.collection('tenants').doc(input.tenantId).set(
      {
        tenantId: input.tenantId,
        primaryStoreId: input.storeId,
        updatedAt: now,
      },
      { merge: true }
    );
    createdDocuments.push(`tenants/${input.tenantId}`);

    return {
      storeId: input.storeId,
      tenantId: input.tenantId,
      bootstrappedAt: now,
      createdDocuments,
      notes: [
        'O bootstrap criou documentos-base da loja e do tenant.',
        'As colecoes de negocio serao materializadas pelo primeiro registro real.',
      ],
    };
  }
}
