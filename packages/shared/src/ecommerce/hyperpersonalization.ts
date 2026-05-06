// Este modulo representa a camada online e rapida da hiperpersonalizacao.
// O ranking principal e comportamental/deterministico; IA pode entrar depois como enriquecimento offline.
export interface PersonalizedProduct {
  id: string;
  storeId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  tags: string[];
  popularity?: number;
  stock: number;
  isActive: boolean;
}

export interface CustomerInteractionEvent {
  storeId: string;
  customerId: string;
  productId: string;
  type: 'click' | 'view' | 'wishlist' | 'cart' | 'purchase';
  createdAt: Date;
}

export interface PersonalizedShowcaseResult {
  showcase: PersonalizedProduct[];
  offers: PersonalizedProduct[];
  dominantCategories: string[];
  dominantTags: string[];
  explanationLabel?: string;
  experimentId?: string;
}

export interface PersonalizedProductQueryOptions {
  limit?: number;
  categoryIds?: string[];
}

interface CustomerBehaviorProfile {
  categoryAffinity: Record<string, number>;
  tagAffinity: Record<string, number>;
  viewedProductIds: string[];
  purchasedProductIds: string[];
}

export interface PersonalizedCustomerSnapshot {
  storeId: string;
  customerId: string;
  categoryAffinity: Record<string, number>;
  tagAffinity: Record<string, number>;
  viewedProductIds: string[];
  purchasedProductIds: string[];
  explanationLabel?: string;
  updatedAt: Date;
}

export interface MerchandisingContext {
  boostedCategoryIds?: string[];
  suppressedProductIds?: string[];
  highlightedProductIds?: string[];
}

export interface PersonalizationExperimentAssignment {
  experimentId: string;
  variantId: string;
}

export interface PersonalizedProductRepository {
  findActiveCatalogProducts(
    storeId: string,
    options?: PersonalizedProductQueryOptions
  ): Promise<PersonalizedProduct[]>;
  findProductsByIds(storeId: string, productIds: string[]): Promise<PersonalizedProduct[]>;
}

export interface CustomerInteractionRepository {
  saveInteraction(event: CustomerInteractionEvent): Promise<void>;
  findInteractionsByCustomer(
    storeId: string,
    customerId: string
  ): Promise<CustomerInteractionEvent[]>;
}

export interface PersonalizationSnapshotRepository {
  getSnapshot(storeId: string, customerId: string): Promise<PersonalizedCustomerSnapshot | null>;
  saveSnapshot(snapshot: PersonalizedCustomerSnapshot): Promise<void>;
}

export interface PersonalizationProfileEnricher {
  enrich(input: {
    storeId: string;
    customerId: string;
    profile: PersonalizedCustomerSnapshot;
  }): Promise<{
    explanationLabel?: string;
  }>;
}

export interface PersonalizationOptionalDependencies {
  snapshotRepository?: PersonalizationSnapshotRepository;
  profileEnricher?: PersonalizationProfileEnricher;
}

const EVENT_WEIGHT: Record<CustomerInteractionEvent['type'], number> = {
  view: 1,
  click: 2,
  wishlist: 3,
  cart: 4,
  purchase: 5,
};

export class EcommerceHyperPersonalizationEngine {
  // Limites conservadores para proteger latencia e evitar consultas largas no catalogo.
  private static readonly EDGE_QUERY_LIMIT = 10;
  private static readonly EDGE_SHOWCASE_LIMIT = 6;
  private static readonly EDGE_OFFERS_LIMIT = 4;

  constructor(
    private readonly productRepository: PersonalizedProductRepository,
    private readonly interactionRepository: CustomerInteractionRepository,
    private readonly optionalDependencies?: PersonalizationOptionalDependencies
  ) {}

  public async trackInteraction(event: CustomerInteractionEvent): Promise<void> {
    // So persistimos eventos ligados a produtos ativos para nao contaminar o perfil do cliente.
    const [product] = await this.productRepository.findProductsByIds(event.storeId, [
      event.productId,
    ]);

    if (!product || !product.isActive || product.stock <= 0) {
      return;
    }

    await this.interactionRepository.saveInteraction(event);
  }

  public async buildPersonalizedExperience(
    storeId: string,
    customerId: string,
    options?: {
      merchandisingContext?: MerchandisingContext;
      experimentAssignment?: PersonalizationExperimentAssignment;
    }
  ): Promise<PersonalizedShowcaseResult> {
    // Se houver snapshot pronto, evitamos uma leitura extra de interacoes no caminho online.
    const [catalog, snapshot] = await Promise.all([
      this.productRepository.findActiveCatalogProducts(storeId, {
        limit: EcommerceHyperPersonalizationEngine.EDGE_QUERY_LIMIT,
      }),
      this.optionalDependencies?.snapshotRepository?.getSnapshot(storeId, customerId) ??
        Promise.resolve(null),
    ]);
    const interactions = snapshot
      ? []
      : await this.interactionRepository.findInteractionsByCustomer(storeId, customerId);

    const availableCatalog = catalog.filter((product) => product.isActive && product.stock > 0);
    const profile = snapshot
      ? this.buildProfileFromSnapshot(snapshot)
      : this.buildProfile(availableCatalog, interactions);
    const viewedProductIds = new Set(profile.viewedProductIds);
    const purchasedProductIds = new Set(profile.purchasedProductIds);
    const suppressedProductIds = new Set(options?.merchandisingContext?.suppressedProductIds ?? []);
    const highlightedProductIds = new Set(
      options?.merchandisingContext?.highlightedProductIds ?? []
    );
    const boostedCategoryIds = new Set(options?.merchandisingContext?.boostedCategoryIds ?? []);

    const scoredProducts = availableCatalog
      .filter((product) => !suppressedProductIds.has(product.id))
      .filter((product) => !purchasedProductIds.has(product.id))
      .map((product) => ({
        product,
        score: this.calculateProductScore(product, profile, {
          highlightedProductIds,
          boostedCategoryIds,
        }),
      }))
      .sort(
        (a, b) => b.score - a.score || (b.product.popularity ?? 0) - (a.product.popularity ?? 0)
      );

    const diversifiedShowcase = this.applyCategoryDiversity(
      scoredProducts.map((item) => item.product),
      EcommerceHyperPersonalizationEngine.EDGE_SHOWCASE_LIMIT
    );

    return {
      // A vitrine principal privilegia maior score combinado com popularidade como criterio de desempate.
      showcase: diversifiedShowcase,
      // Ofertas reaproveitam sinais de produtos vistos/parecidos sem recalcular toda a home.
      offers: scoredProducts
        .filter(
          (item) =>
            viewedProductIds.has(item.product.id) || this.isSimilarToViewed(item.product, profile)
        )
        .slice(0, EcommerceHyperPersonalizationEngine.EDGE_OFFERS_LIMIT)
        .map((item) => item.product),
      dominantCategories: this.getTopKeys(profile.categoryAffinity, 3),
      dominantTags: this.getTopKeys(profile.tagAffinity, 5),
      explanationLabel: snapshot?.explanationLabel,
      experimentId: options?.experimentAssignment?.experimentId,
    };
  }

  public async processProfileEnrichmentJob(
    storeId: string,
    customerId: string
  ): Promise<PersonalizedCustomerSnapshot | null> {
    if (!this.optionalDependencies?.snapshotRepository) {
      return null;
    }

    const [catalog, interactions] = await Promise.all([
      this.productRepository.findActiveCatalogProducts(storeId, {
        limit: EcommerceHyperPersonalizationEngine.EDGE_QUERY_LIMIT,
      }),
      this.interactionRepository.findInteractionsByCustomer(storeId, customerId),
    ]);

    const profile = this.buildProfile(catalog, interactions);
    const snapshot: PersonalizedCustomerSnapshot = {
      storeId,
      customerId,
      categoryAffinity: profile.categoryAffinity,
      tagAffinity: profile.tagAffinity,
      viewedProductIds: profile.viewedProductIds,
      purchasedProductIds: profile.purchasedProductIds,
      updatedAt: new Date(),
    };

    if (this.optionalDependencies.profileEnricher) {
      const enrichment = await this.optionalDependencies.profileEnricher.enrich({
        storeId,
        customerId,
        profile: snapshot,
      });
      snapshot.explanationLabel = enrichment.explanationLabel;
    }

    await this.optionalDependencies.snapshotRepository.saveSnapshot(snapshot);
    return snapshot;
  }

  private buildProfile(
    catalog: PersonalizedProduct[],
    interactions: CustomerInteractionEvent[]
  ): CustomerBehaviorProfile {
    // Afinidade acumulada por categoria e tag e suficiente para a camada de decisao em tempo real.
    const catalogById = Object.fromEntries(catalog.map((product) => [product.id, product]));
    const categoryAffinity: Record<string, number> = {};
    const tagAffinity: Record<string, number> = {};
    const viewedProductIds = new Set<string>();
    const purchasedProductIds = new Set<string>();

    for (const event of interactions) {
      const product = catalogById[event.productId];

      if (!product) {
        continue;
      }

      const weight = EVENT_WEIGHT[event.type];
      viewedProductIds.add(product.id);
      if (event.type === 'purchase') {
        purchasedProductIds.add(product.id);
      }
      categoryAffinity[product.categoryName] =
        (categoryAffinity[product.categoryName] ?? 0) + weight;

      for (const tag of product.tags) {
        tagAffinity[tag] = (tagAffinity[tag] ?? 0) + weight;
      }
    }

    return {
      categoryAffinity,
      tagAffinity,
      viewedProductIds: Array.from(viewedProductIds),
      purchasedProductIds: Array.from(purchasedProductIds),
    };
  }

  private buildProfileFromSnapshot(
    snapshot: PersonalizedCustomerSnapshot
  ): CustomerBehaviorProfile {
    return {
      categoryAffinity: snapshot.categoryAffinity,
      tagAffinity: snapshot.tagAffinity,
      viewedProductIds: snapshot.viewedProductIds,
      purchasedProductIds: snapshot.purchasedProductIds,
    };
  }

  private calculateProductScore(
    product: PersonalizedProduct,
    profile: CustomerBehaviorProfile,
    context?: {
      highlightedProductIds: Set<string>;
      boostedCategoryIds: Set<string>;
    }
  ): number {
    // Popularidade evita cold start severo quando ainda ha pouco historico do cliente.
    let score = product.popularity ?? 0;

    score += (profile.categoryAffinity[product.categoryName] ?? 0) * 3;

    for (const tag of product.tags) {
      score += profile.tagAffinity[tag] ?? 0;
    }

    if (profile.viewedProductIds.includes(product.id)) {
      score += 2;
    }

    if (context?.highlightedProductIds.has(product.id)) {
      score += 4;
    }

    if (context?.boostedCategoryIds.has(product.categoryId)) {
      score += 3;
    }

    return score;
  }

  private isSimilarToViewed(
    product: PersonalizedProduct,
    profile: CustomerBehaviorProfile
  ): boolean {
    // Similaridade simples mantem a oferta barata de calcular e previsivel.
    if ((profile.categoryAffinity[product.categoryName] ?? 0) > 0) {
      return true;
    }

    return product.tags.some((tag) => (profile.tagAffinity[tag] ?? 0) > 0);
  }

  private getTopKeys(source: Record<string, number>, limit: number): string[] {
    return Object.entries(source)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => key);
  }

  private applyCategoryDiversity(
    products: PersonalizedProduct[],
    limit: number
  ): PersonalizedProduct[] {
    const selected: PersonalizedProduct[] = [];
    const categoryCount = new Map<string, number>();

    for (const product of products) {
      const currentCount = categoryCount.get(product.categoryId) ?? 0;

      if (currentCount >= 2 && selected.length < limit - 1) {
        continue;
      }

      selected.push(product);
      categoryCount.set(product.categoryId, currentCount + 1);

      if (selected.length >= limit) {
        break;
      }
    }

    return selected;
  }
}
