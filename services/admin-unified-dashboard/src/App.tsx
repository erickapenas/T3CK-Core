import { useEffect, useState } from 'react';
import AdminDashboard from './AdminDashboard';
import { saveTenantSelection, loadTenantSelection } from './tenant-storage';

export default function App() {
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState('tenant-demo');

  // Load tenant from Firebase on mount
  useEffect(() => {
    const loadTenant = async () => {
      try {
        const tenant = await loadTenantSelection('tenant-demo');
        setSelectedTenant(tenant);
      } catch (error) {
        console.error('Error loading tenant:', error);
        setSelectedTenant('tenant-demo');
      } finally {
        setIsLoadingTenant(false);
      }
    };

    loadTenant();
  }, []);

  // Save tenant to Firebase when it changes
  useEffect(() => {
    if (!isLoadingTenant) {
      saveTenantSelection(selectedTenant);
    }
  }, [selectedTenant, isLoadingTenant]);

  if (isLoadingTenant) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0a0e27',
          color: '#f8fafc',
          fontFamily: 'Inter Tight, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{ fontSize: '32px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}
          >
            ⟳
          </div>
          <p>Carregando preferências do Firebase...</p>
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return <AdminDashboard tenantId={selectedTenant} />;
}
