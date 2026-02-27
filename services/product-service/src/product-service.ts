import {
  AddImageInput,
  Category,
  CreateCategoryInput,
  CreateProductInput,
  CreateVariantInput,
  InventoryMovement,
  Product,
  ProductFilters,
  ProductImage,
  ProductVariant,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateVariantInput,
} from './types';

const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const now = (): string => new Date().toISOString();
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export class ProductService {
  private products = new Map<string, Product>();
  private categories = new Map<string, Category>();
  private inventoryMovements = new Map<string, InventoryMovement[]>();

  createProduct(input: CreateProductInput): Product {
    const id = randomId('prod');
    const timestamp = now();

    const product: Product = {
      id,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      slug: slugify(input.name),
      sku: input.sku,
      categoryId: input.categoryId,
      tags: input.tags || [],
      active: input.active ?? true,
      basePrice: input.basePrice,
      stock: input.stock ?? 0,
      variants: [],
      images: [],
      rating: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.products.set(id, product);
    return product;
  }

  listProducts(tenantId: string, filters?: ProductFilters): Product[] {
    let result = Array.from(this.products.values()).filter((product) => product.tenantId === tenantId);

    if (!filters) {
      return result;
    }

    if (filters.query) {
      const query = filters.query.toLowerCase();
      result = result.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.description?.toLowerCase().includes(query) ||
          product.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    if (filters.categoryId) {
      result = result.filter((product) => product.categoryId === filters.categoryId);
    }

    if (typeof filters.minPrice === 'number') {
      result = result.filter((product) => product.basePrice >= filters.minPrice!);
    }

    if (typeof filters.maxPrice === 'number') {
      result = result.filter((product) => product.basePrice <= filters.maxPrice!);
    }

    if (typeof filters.inStock === 'boolean') {
      result = result.filter((product) => (filters.inStock ? product.stock > 0 : product.stock === 0));
    }

    if (filters.tag) {
      result = result.filter((product) => product.tags.includes(filters.tag!));
    }

    if (typeof filters.active === 'boolean') {
      result = result.filter((product) => product.active === filters.active);
    }

    if (filters.sortBy === 'name') {
      result = result.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (filters.sortBy === 'price-asc') {
      result = result.sort((a, b) => a.basePrice - b.basePrice);
    }

    if (filters.sortBy === 'price-desc') {
      result = result.sort((a, b) => b.basePrice - a.basePrice);
    }

    if (filters.sortBy === 'newest') {
      result = result.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    if (filters.sortBy === 'rating') {
      result = result.sort((a, b) => b.rating - a.rating);
    }

    return result;
  }

  getProduct(tenantId: string, productId: string): Product | undefined {
    const product = this.products.get(productId);
    if (!product || product.tenantId !== tenantId) {
      return undefined;
    }
    return product;
  }

  updateProduct(tenantId: string, productId: string, input: UpdateProductInput): Product {
    const product = this.requireProduct(tenantId, productId);

    const updated: Product = {
      ...product,
      ...input,
      slug: input.name ? slugify(input.name) : product.slug,
      updatedAt: now(),
    };

    this.products.set(productId, updated);
    return updated;
  }

  deleteProduct(tenantId: string, productId: string): boolean {
    const product = this.products.get(productId);
    if (!product || product.tenantId !== tenantId) {
      return false;
    }
    this.products.delete(productId);
    this.inventoryMovements.delete(productId);
    return true;
  }

  createCategory(input: CreateCategoryInput): Category {
    const id = randomId('cat');
    const timestamp = now();
    const category: Category = {
      id,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      slug: slugify(input.name),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.categories.set(id, category);
    return category;
  }

  listCategories(tenantId: string): Category[] {
    return Array.from(this.categories.values()).filter((category) => category.tenantId === tenantId);
  }

  updateCategory(tenantId: string, categoryId: string, input: UpdateCategoryInput): Category {
    const category = this.requireCategory(tenantId, categoryId);

    const updated: Category = {
      ...category,
      ...input,
      slug: input.name ? slugify(input.name) : category.slug,
      updatedAt: now(),
    };

    this.categories.set(categoryId, updated);
    return updated;
  }

  deleteCategory(tenantId: string, categoryId: string): boolean {
    const category = this.categories.get(categoryId);
    if (!category || category.tenantId !== tenantId) {
      return false;
    }

    this.categories.delete(categoryId);

    const products = this.listProducts(tenantId);
    for (const product of products) {
      if (product.categoryId === categoryId) {
        const updated = { ...product, categoryId: undefined, updatedAt: now() };
        this.products.set(product.id, updated);
      }
    }

    return true;
  }

  addVariant(tenantId: string, productId: string, input: CreateVariantInput): ProductVariant {
    const product = this.requireProduct(tenantId, productId);

    const variant: ProductVariant = {
      id: randomId('var'),
      sku: input.sku,
      name: input.name,
      attributes: input.attributes || {},
      additionalPrice: input.additionalPrice ?? 0,
      stock: input.stock ?? 0,
      createdAt: now(),
      updatedAt: now(),
    };

    product.variants.push(variant);
    product.updatedAt = now();
    this.products.set(productId, product);

    return variant;
  }

  updateVariant(
    tenantId: string,
    productId: string,
    variantId: string,
    input: UpdateVariantInput
  ): ProductVariant {
    const product = this.requireProduct(tenantId, productId);
    const variantIndex = product.variants.findIndex((variant) => variant.id === variantId);

    if (variantIndex < 0) {
      throw new Error('Variant not found');
    }

    const current = product.variants[variantIndex];
    const updated: ProductVariant = {
      ...current,
      ...input,
      updatedAt: now(),
    };

    product.variants[variantIndex] = updated;
    product.updatedAt = now();
    this.products.set(productId, product);

    return updated;
  }

  removeVariant(tenantId: string, productId: string, variantId: string): boolean {
    const product = this.requireProduct(tenantId, productId);
    const before = product.variants.length;
    product.variants = product.variants.filter((variant) => variant.id !== variantId);

    if (product.variants.length === before) {
      return false;
    }

    product.updatedAt = now();
    this.products.set(productId, product);
    return true;
  }

  addImage(tenantId: string, productId: string, input: AddImageInput): ProductImage {
    const product = this.requireProduct(tenantId, productId);

    const image: ProductImage = {
      id: randomId('img'),
      url: input.url,
      alt: input.alt,
      position: input.position ?? product.images.length,
      createdAt: now(),
    };

    product.images.push(image);
    product.images = product.images.sort((a, b) => a.position - b.position);
    product.updatedAt = now();
    this.products.set(productId, product);

    return image;
  }

  removeImage(tenantId: string, productId: string, imageId: string): boolean {
    const product = this.requireProduct(tenantId, productId);
    const before = product.images.length;
    product.images = product.images.filter((image) => image.id !== imageId);

    if (product.images.length === before) {
      return false;
    }

    product.updatedAt = now();
    this.products.set(productId, product);
    return true;
  }

  getRecommendations(tenantId: string, productId: string, limit: number = 5): Product[] {
    const reference = this.requireProduct(tenantId, productId);

    const candidates = this.listProducts(tenantId, { active: true })
      .filter((product) => product.id !== productId)
      .map((candidate) => {
        let score = 0;

        if (candidate.categoryId && candidate.categoryId === reference.categoryId) {
          score += 4;
        }

        const commonTags = candidate.tags.filter((tag) => reference.tags.includes(tag));
        score += commonTags.length * 2;

        if (Math.abs(candidate.basePrice - reference.basePrice) <= reference.basePrice * 0.25) {
          score += 1;
        }

        score += candidate.rating;

        return { candidate, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit));

    return candidates.map((item) => item.candidate);
  }

  getInventory(tenantId: string, productId: string): {
    productId: string;
    stock: number;
    variants: { id: string; stock: number }[];
    movements: InventoryMovement[];
  } {
    const product = this.requireProduct(tenantId, productId);

    return {
      productId,
      stock: product.stock,
      variants: product.variants.map((variant) => ({ id: variant.id, stock: variant.stock })),
      movements: (this.inventoryMovements.get(productId) || []).filter(
        (movement) => movement.tenantId === tenantId
      ),
    };
  }

  adjustStock(
    tenantId: string,
    productId: string,
    delta: number,
    reason?: string,
    variantId?: string
  ): {
    productStock: number;
    variantStock?: number;
    movement: InventoryMovement;
  } {
    const product = this.requireProduct(tenantId, productId);

    let variantStock: number | undefined;

    if (variantId) {
      const variant = product.variants.find((item) => item.id === variantId);
      if (!variant) {
        throw new Error('Variant not found');
      }
      const next = variant.stock + delta;
      if (next < 0) {
        throw new Error('Insufficient variant stock');
      }
      variant.stock = next;
      variant.updatedAt = now();
      variantStock = variant.stock;
    } else {
      const next = product.stock + delta;
      if (next < 0) {
        throw new Error('Insufficient stock');
      }
      product.stock = next;
    }

    product.updatedAt = now();
    this.products.set(productId, product);

    const movement: InventoryMovement = {
      id: randomId('mov'),
      tenantId,
      productId,
      variantId,
      delta,
      reason,
      createdAt: now(),
    };

    const productMovements = this.inventoryMovements.get(productId) || [];
    productMovements.push(movement);
    this.inventoryMovements.set(productId, productMovements);

    return {
      productStock: product.stock,
      variantStock,
      movement,
    };
  }

  setStock(
    tenantId: string,
    productId: string,
    quantity: number,
    reason?: string,
    variantId?: string
  ): {
    productStock: number;
    variantStock?: number;
    movement: InventoryMovement;
  } {
    const product = this.requireProduct(tenantId, productId);

    let delta = 0;
    let variantStock: number | undefined;

    if (variantId) {
      const variant = product.variants.find((item) => item.id === variantId);
      if (!variant) {
        throw new Error('Variant not found');
      }
      delta = quantity - variant.stock;
      variant.stock = quantity;
      variant.updatedAt = now();
      variantStock = quantity;
    } else {
      delta = quantity - product.stock;
      product.stock = quantity;
    }

    product.updatedAt = now();
    this.products.set(productId, product);

    const movement: InventoryMovement = {
      id: randomId('mov'),
      tenantId,
      productId,
      variantId,
      delta,
      reason,
      createdAt: now(),
    };

    const productMovements = this.inventoryMovements.get(productId) || [];
    productMovements.push(movement);
    this.inventoryMovements.set(productId, productMovements);

    return {
      productStock: product.stock,
      variantStock,
      movement,
    };
  }

  private requireProduct(tenantId: string, productId: string): Product {
    const product = this.products.get(productId);
    if (!product || product.tenantId !== tenantId) {
      throw new Error('Product not found');
    }
    return product;
  }

  private requireCategory(tenantId: string, categoryId: string): Category {
    const category = this.categories.get(categoryId);
    if (!category || category.tenantId !== tenantId) {
      throw new Error('Category not found');
    }
    return category;
  }
}
