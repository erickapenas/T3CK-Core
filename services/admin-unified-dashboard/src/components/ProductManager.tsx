import { useEffect, useMemo, useState } from 'react';
import '../styles/ProductManager.css';
import {
  FirestoreTenant,
  FirestoreProduct,
  deleteProductFromFirestore,
  listTenantsFromFirestore,
  listProductsFromFirestore,
  saveProductToFirestore,
} from '../tenant-storage';

type ProductManagerProps = {
  tenantId: string;
  onChange?: () => void;
};

type ProductFormState = Partial<FirestoreProduct>;

const EMPTY_FORM: ProductFormState = {
  tenantId: '',
  sku: '',
  name: '',
  slug: '',
  description: '',
  shortDescription: '',
  mainImageUrl: '',
  price: 0,
  oldPrice: 0,
  costPrice: 0,
  currency: 'BRL',
  stockQuantity: 0,
  manageStock: true,
  weight: 0,
  height: 0,
  width: 0,
  length: 0,
  properties: {},
  isActive: true,
  isDeleted: false,
};

export function ProductManager({ tenantId, onChange }: ProductManagerProps) {
  const [products, setProducts] = useState<FirestoreProduct[]>([]);
  const [tenants, setTenants] = useState<FirestoreTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState(tenantId);
  const [minStock, setMinStock] = useState('');
  const [maxStock, setMaxStock] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProductDocId, setSelectedProductDocId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>({ ...EMPTY_FORM, tenantId: selectedTenantId });
  const [propertyKey, setPropertyKey] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [tenantData, productData] = await Promise.all([
        listTenantsFromFirestore(),
        listProductsFromFirestore(selectedTenantId),
      ]);
      setTenants(tenantData);
      setProducts(productData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedTenantId]);

  useEffect(() => {
    setSelectedTenantId(tenantId);
  }, [tenantId]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const minStockValue = minStock === '' ? null : Number(minStock);
    const maxStockValue = maxStock === '' ? null : Number(maxStock);
    const minPriceValue = minPrice === '' ? null : Number(minPrice);
    const maxPriceValue = maxPrice === '' ? null : Number(maxPrice);

    return products.filter((product) => {
      const matchesText =
        !term ||
        [product.id, product.sku, product.name, product.slug, product.currency, product.tenantId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      const stock = Number(product.stockQuantity || 0);
      const price = Number(product.price || 0);
      const matchesStock =
        (minStockValue === null || stock >= minStockValue) &&
        (maxStockValue === null || stock <= maxStockValue);
      const matchesPrice =
        (minPriceValue === null || price >= minPriceValue) &&
        (maxPriceValue === null || price <= maxPriceValue);

      return matchesText && matchesStock && matchesPrice;
    });
  }, [search, products, minStock, maxStock, minPrice, maxPrice]);

  const properties = (
    form.properties && typeof form.properties === 'object' ? form.properties : {}
  ) as Record<string, any>;

  const handleFieldChange = (field: keyof ProductFormState, value: any) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleNew = () => {
    setSelectedProductId(null);
    setSelectedProductDocId(null);
    setForm({ ...EMPTY_FORM, tenantId: selectedTenantId });
    setPropertyKey('');
    setPropertyValue('');
    setMessage(null);
    setError(null);
  };

  const handleEdit = (product: FirestoreProduct) => {
    setSelectedProductId(product.id);
    setSelectedProductDocId(product.docId || product.name || null);
    setForm({
      ...EMPTY_FORM,
      ...product,
      tenantId: product.tenantId || selectedTenantId,
      properties: product.properties || {},
    });
    setMessage(null);
    setError(null);
  };

  const upsertProperty = () => {
    if (!propertyKey.trim()) return;
    setForm((current) => ({
      ...current,
      properties: {
        ...(current.properties && typeof current.properties === 'object' ? current.properties : {}),
        [propertyKey.trim()]: propertyValue,
      },
    }));
    setPropertyKey('');
    setPropertyValue('');
  };

  const removeProperty = (key: string) => {
    setForm((current) => {
      const next = {
        ...(current.properties && typeof current.properties === 'object' ? current.properties : {}),
      };
      delete next[key];
      return { ...current, properties: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (!selectedTenantId) throw new Error('Tenant is required');
      if (!form.sku || !form.name || !form.slug) {
        throw new Error('SKU, name and slug are required');
      }

      const slugConflict = products.some(
        (item) =>
          item.slug?.toLowerCase() === form.slug?.toLowerCase() &&
          item.id !== selectedProductId &&
          item.tenantId === selectedTenantId
      );

      if (slugConflict) {
        throw new Error('Slug já existe para este tenant');
      }

      const saved = await saveProductToFirestore(
        {
          ...form,
          id: selectedProductId || form.id,
          tenantId: selectedTenantId,
          properties,
        } as FirestoreProduct,
        selectedProductDocId || undefined
      );

      setSelectedProductId(saved.id);
      setSelectedProductDocId(saved.docId || saved.name || null);
      setForm({
        ...EMPTY_FORM,
        ...saved,
        tenantId: selectedTenantId,
        properties: saved.properties || {},
      });
      setMessage('Produto salvo no Firestore');
      await loadData();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar produto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!window.confirm('Excluir este produto do Firestore?')) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const product = products.find((item) => item.id === productId);
      if (!product) {
        throw new Error('Produto não encontrado');
      }

      await deleteProductFromFirestore(
        product.tenantId || selectedTenantId,
        product.docId || product.name || productId
      );
      if (selectedProductId === productId) handleNew();
      setMessage('Produto removido');
      await loadData();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir produto');
    } finally {
      setSaving(false);
    }
  };

  const stockTone = (stockQuantity?: number) => {
    if ((stockQuantity || 0) <= 5) return 'low';
    if ((stockQuantity || 0) <= 20) return 'medium';
    return 'high';
  };

  return (
    <div className="product-manager">
      <div className="tenant-manager-topbar">
        <div>
          <h3>Firestore Products</h3>
          <p>Produtos multitenant com schema rico e propriedades dinâmicas.</p>
        </div>
        <div className="tenant-manager-actions">
          <select value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.companyName || tenant.id}
              </option>
            ))}
          </select>
          <input
            className="tenant-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
          />
          <input
            className="tenant-search"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            placeholder="Min stock"
            type="number"
          />
          <input
            className="tenant-search"
            value={maxStock}
            onChange={(e) => setMaxStock(e.target.value)}
            placeholder="Max stock"
            type="number"
          />
          <input
            className="tenant-search"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min price"
            type="number"
          />
          <input
            className="tenant-search"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max price"
            type="number"
          />
          <button className="tenant-btn secondary" onClick={handleNew} disabled={saving}>
            Novo
          </button>
          <button className="tenant-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {(error || message) && (
        <div className={`tenant-banner ${error ? 'error' : 'success'}`}>{error || message}</div>
      )}

      <div className="tenant-manager-grid">
        <section className="tenant-form-card product-form-card">
          <h4>{selectedProductId ? 'Editar produto' : 'Criar produto'}</h4>
          <div className="tenant-empty" style={{ marginBottom: 12 }}>
            Tenant atual: <strong>{selectedTenantId}</strong>
            <div style={{ marginTop: 6 }}>Documento do produto = nome do produto</div>
          </div>

          <div className="tenant-form-grid">
            <label>
              Product ID
              <input
                value={form.id || ''}
                onChange={(e) => handleFieldChange('id', e.target.value)}
              />
            </label>
            <label>
              Tenant ID
              <select
                value={form.tenantId || selectedTenantId}
                onChange={(e) => {
                  setSelectedTenantId(e.target.value);
                  handleFieldChange('tenantId', e.target.value);
                }}
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.companyName || tenant.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              SKU
              <input
                value={form.sku || ''}
                onChange={(e) => handleFieldChange('sku', e.target.value)}
              />
            </label>
            <label>
              Name
              <input
                value={form.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </label>
            <label>
              Slug
              <input
                value={form.slug || ''}
                onChange={(e) => handleFieldChange('slug', e.target.value)}
              />
            </label>
            <label className="full-span">
              Short description
              <input
                value={form.shortDescription || ''}
                onChange={(e) => handleFieldChange('shortDescription', e.target.value)}
              />
            </label>
            <label className="full-span">
              Description
              <textarea
                rows={4}
                value={form.description || ''}
                onChange={(e) => handleFieldChange('description', e.target.value)}
              />
            </label>
            <label className="full-span">
              Main image URL
              <input
                value={form.mainImageUrl || ''}
                onChange={(e) => handleFieldChange('mainImageUrl', e.target.value)}
              />
            </label>
            <label>
              Price
              <input
                type="number"
                value={form.price ?? 0}
                onChange={(e) => handleFieldChange('price', Number(e.target.value))}
              />
            </label>
            <label>
              Old price
              <input
                type="number"
                value={form.oldPrice ?? 0}
                onChange={(e) => handleFieldChange('oldPrice', Number(e.target.value))}
              />
            </label>
            <label>
              Cost price
              <input
                type="number"
                value={form.costPrice ?? 0}
                onChange={(e) => handleFieldChange('costPrice', Number(e.target.value))}
              />
            </label>
            <label>
              Currency
              <select
                value={form.currency || 'BRL'}
                onChange={(e) => handleFieldChange('currency', e.target.value)}
              >
                <option value="BRL">BRL</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label>
              Stock quantity
              <input
                type="number"
                value={form.stockQuantity ?? 0}
                onChange={(e) => handleFieldChange('stockQuantity', Number(e.target.value))}
              />
            </label>
            <label>
              Manage stock
              <select
                value={String(!!form.manageStock)}
                onChange={(e) => handleFieldChange('manageStock', e.target.value === 'true')}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>
              Weight
              <input
                type="number"
                value={form.weight ?? 0}
                onChange={(e) => handleFieldChange('weight', Number(e.target.value))}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                value={form.height ?? 0}
                onChange={(e) => handleFieldChange('height', Number(e.target.value))}
              />
            </label>
            <label>
              Width
              <input
                type="number"
                value={form.width ?? 0}
                onChange={(e) => handleFieldChange('width', Number(e.target.value))}
              />
            </label>
            <label>
              Length
              <input
                type="number"
                value={form.length ?? 0}
                onChange={(e) => handleFieldChange('length', Number(e.target.value))}
              />
            </label>
            <label>
              Is active
              <select
                value={String(!!form.isActive)}
                onChange={(e) => handleFieldChange('isActive', e.target.value === 'true')}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>
              Is deleted
              <select
                value={String(!!form.isDeleted)}
                onChange={(e) => handleFieldChange('isDeleted', e.target.value === 'true')}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>
          </div>

          <div className="product-properties">
            <div className="product-properties-header">
              <h5>Properties</h5>
              <span>JSON / chips dinâmicos</span>
            </div>
            <div className="product-properties-inputs">
              <input
                value={propertyKey}
                onChange={(e) => setPropertyKey(e.target.value)}
                placeholder="key"
              />
              <input
                value={propertyValue}
                onChange={(e) => setPropertyValue(e.target.value)}
                placeholder="value"
              />
              <button className="tenant-btn secondary" type="button" onClick={upsertProperty}>
                Add
              </button>
            </div>
            <div className="product-properties-chips">
              {Object.entries(properties).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  className="product-chip"
                  onClick={() => removeProperty(key)}
                >
                  <strong>{key}</strong>
                  <span>{String(value)}</span>
                  <em>×</em>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="tenant-list-card">
          <div className="tenant-list-header">
            <h4>Products ({filteredProducts.length})</h4>
            <button
              className="tenant-btn secondary"
              onClick={loadData}
              disabled={loading || saving}
            >
              Recarregar
            </button>
          </div>

          {loading ? (
            <div className="tenant-empty">Carregando produtos...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="tenant-empty">Nenhum produto encontrado</div>
          ) : (
            <div className="product-list">
              {filteredProducts.map((product) => (
                <article
                  key={product.id}
                  className={`product-row ${selectedProductId === product.id ? 'active' : ''}`}
                >
                  <div className="product-row-main" onClick={() => handleEdit(product)}>
                    <div className="product-row-title">
                      <strong>{product.name || product.sku || product.id}</strong>
                      <span className={`tenant-badge stock-${stockTone(product.stockQuantity)}`}>
                        {product.stockQuantity ?? 0} stock
                      </span>
                    </div>
                    <div className="product-row-meta">
                      <span>SKU: {product.sku || '-'}</span>
                      <span>Slug: {product.slug || '-'}</span>
                      <span>{product.currency || 'BRL'}</span>
                      <span>Tenant: {product.tenantId || selectedTenantId}</span>
                    </div>
                    <div className="product-row-pricing">
                      <span className="price-current">
                        R$ {Number(product.price || 0).toFixed(2)}
                      </span>
                      {product.oldPrice ? (
                        <span className="price-old">
                          De R$ {Number(product.oldPrice).toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="tenant-row-actions">
                    <button className="tenant-btn secondary" onClick={() => handleEdit(product)}>
                      Editar
                    </button>
                    <button className="tenant-btn danger" onClick={() => handleDelete(product.id)}>
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
