# 🎨 T3CK-Core Admin Dashboard - Design System 2026

## Visão Geral

Este é um **Admin Dashboard de ultra-alta fidelidade** para T3CK Core, implementando o conceito "Atomic Control Grid v2026" com design hyper-funcional.

**Status**: ✅ Production Ready
**Versão**: 2.0
**Last Updated**: 2026-04-07

---

## 🎯 Conceito de Design

### Filosofia: Hyper-Functionalism 2026

```
DENSIDADE FUNCIONAL MÁXIMA
         ↓
Múltiplos controles aninhados + acionáveis
         ↓
Alinhamento ESTRITO em schema técnico
         ↓
Visual ultra-afiado + micro-interações
         ↓
Complexidade minimizada em UI limpo
```

### Componentes Principais

```
┌─────────────────────────────────────────────┐
│  T3CK-Core | Atomic Control Grid v2026      │  ← Header
├──────────┬──────────────────────┬───────────┤
│          │                      │           │
│ System  │  Entity Command      │   CRUD    │
│  Tree   │      Center          │ Operations│
│ (Left)  │     (Center)         │  (Right)  │ ← Bento-Box Layout
│          │                      │           │
│          │                      │           │
├─────────────────────────────────────────────┤
│ DB Connected │ Sync │ API │ Sessions │ Last │ ← Footer
└─────────────────────────────────────────────┘
```

---

## 🎨 Paleta de Cores

### Tema: Deep Space

| Nome | Hex | Uso | Notas |
|------|-----|-----|-------|
| **Obsidian** | `#0a0e27` | Background primário | Muito escuro |
| **Charcoal** | `#1a1f3a` | Componentes | Contraste médio |
| **Slate** | `#2d3548` | Borders/Overlays | Sutil |
| **Steel** | `#4a5568` | Texto secundário | Mode text |

### Functional Accents

| Nome | Hex | Uso | Efeito |
|------|-----|-----|--------|
| **Cyber Lime** | `#00ff41` | Success/Create | Glow success |
| **Volt Blue** | `#00d4ff` | System/Info | Glow info |
| **Cinnabar** | `#ff3333` | Error/Delete | Glow error |
| **Amber** | `#ffa500` | Warning/Update | Standard |

---

## 📐 Espacçamento & Tipografia

### Spacing Scale

```css
--spacing-xs: 4px      /* Micro spacing */
--spacing-sm: 8px      /* Small gaps */
--spacing-md: 12px     /* Medium (default) */
--spacing-lg: 16px     /* Large gaps */
--spacing-xl: 24px     /* Extra large */
```

### Typography

```css
/* Dados/Schemas */
--font-mono: 'JetBrains Mono'
font-size: 11px, linha-height: 1.5

/* UI/Componentes */
--font-ui: 'Inter Tight'
font-sizes: 10px-16px
font-weights: 600-800
letter-spacing: 0.5-2px
```

---

## 🔘 Componentes

### 1. System Tree (Left Pane)

**Propósito**: Navegação de entidades

```
System Tree
├─ 🏢 Tenants      [32]
├─ 👥 Users        [32]
├─ 📦 Products     [32]
├─ 📋 Orders       [32]
├─ 💳 Payments     [32]
├─ 🔗 Webhooks     [32]
├─ 📝 Logs         [32]
└─ ⚡ Cache        [32]
```

**Interações**:
- Click: Seleciona entidade → carrega em Command Center
- Hover: Glow success (#00ff41)
- Active: Background rgba(0,255,65,0.1)

---

### 2. Entity Command Center (Center Pane)

**Propósito**: Visualizar e editar dados da entidade

**Seções**:
1. **Entity Info** - Nome + Status badges
2. **Data Schema** - Campos de entrada
   - UUID input (mono font)
   - Entity Name
   - JSON Payload (textarea)
   - Status select
   - API Response Time display

3. **Relational Chips** - Links entre entidades
   - Chip primary (lime)
   - Chip secondary (blue)
   - Chip add button

4. **Metadata** - Info sistema
   - created_at, updated_at, version, db_sync

---

### 3. CRUD Cluster (Right Pane)

**Propósito**: Operações de banco de dados

**4 Botões CRUD**:
```
┌─────────┬─────────┐
│ ✚ CREATE│ 📖 READ │
├─────────┼─────────┤
│ ✎ UPDATE│ ✕ DELETE│
└─────────┴─────────┘
```

- **CREATE**: Lime - INSERT
- **READ**: Blue - SELECT
- **UPDATE**: Amber - MODIFY
- **DELETE**: Red - REMOVE

**Sections**:
- Batch Operations (Import/Export/Sync/Purge)
- Recent Actions (histórico)

---

### 4. Status Indicators (Header)

**Real-time Metrics**:
- Database: Connected/Offline (dot animado)
- Sync: In-sync/Syncing (pulse animation)
- API Response Time: XXXms
- Active Sessions: N
- Last Sync: HH:MM:SS

---

## 🎨 Efeitos Visuais

### Glass Morphism

```css
backdrop-filter: blur(16px) saturate(150%);
border: 1px solid rgba(45, 53, 72, 0.8);
background: rgba(26, 31, 58, 0.5);
```

### Glows

```css
--glow-success: 0 0 12px rgba(0, 255, 65, 0.3);
--glow-info: 0 0 12px rgba(0, 212, 255, 0.3);
--glow-error: 0 0 12px rgba(255, 51, 51, 0.3);
```

### Micro-interactions

- **Hover**: Glow + Border color change + opacity
- **Click**: Ripple effect (pseudo-element)
- **Active**: Background gradient + sustained glow
- **Pulse**: Animations (respiratory motion)
- **Spin**: Animations (loading states)

---

## 📁 Estrutura de Arquivos

```
admin-unified-dashboard/
├── src/
│   ├── AdminDashboard.tsx          # Main component
│   ├── AdminDashboard.css          # Master styles
│   ├── components/
│   │   ├── SystemTree.tsx
│   │   ├── EntityCommandCenter.tsx
│   │   ├── StatusIndicators.tsx
│   │   └── CRUDCluster.tsx
│   ├── styles/
│   │   ├── SystemTree.css
│   │   ├── EntityCommandCenter.css
│   │   ├── StatusIndicators.css
│   │   └── CRUDCluster.css
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 🚀 Como Implementar

### 1. Importar AdminDashboard

```typescript
import AdminDashboard from './AdminDashboard';

function App() {
  return <AdminDashboard />;
}
```

### 2. Instalar Dependências

```bash
pnpm install
# ou
npm install
```

### 3. Rodar Dev Server

```bash
pnpm run dev
# Abre em http://localhost:5176
```

### 4. Build Produção

```bash
pnpm run build
# Artifacts em dist/
```

---

## 🎯 Customização

### Mudar Cor Primária

```css
:root {
  --cyber-lime: #00ff41;  /* ← Mudar aqui */
}
```

Afeta todos os componentes "success".

### Mudar Font

```css
:root {
  --font-mono: 'Courier New';  /* ← Custom mono font */
  --font-ui: 'Futura';          /* ← Custom UI font */
}
```

### Mudar Layout

#### Responsivo: 3-colunas → 1-coluna

```css
@media (max-width: 1200px) {
  .dashboard-main {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
  }
}
```

Já implementado!

---

## 🔧 Extensão - Adicionar Novo Componente

### Exemplo: Adicionar "Analytics Pane"

**Passo 1**: Criar componente

```typescript
// src/components/AnalyticsDashboard.tsx
export function AnalyticsDashboard() {
  return (
    <div className="analytics-dashboard">
      {/* Seu conteúdo */}
    </div>
  );
}
```

**Passo 2**: Adicionar CSS

```css
/* src/styles/Analytics.css */
.analytics-dashboard {
  /* Seus estilos */
}
```

**Passo 3**: Importar em AdminDashboard

```typescript
import { AnalyticsDashboard } from './components/AnalyticsDashboard';

// No JSX:
<aside className="pane pane-analytics">
  <div className="pane-header">
    <h2>Analytics</h2>
  </div>
  <AnalyticsDashboard />
</aside>
```

**Passo 4**: Atualizar grid layout

```css
.pane-analytics {
  grid-column: 4;  /* Nova coluna */
  grid-row: 1 / -2;
}

@media (max-width: 1400px) {
  .dashboard-main {
    grid-template-columns: 240px 1fr 280px 300px;  /* +300px */
  }
}
```

---

## 🎨 Design Principles

### 1. **Atomic Design**
- Componentes pequenos e reutilizáveis
- Props validez
- Composição flexível

### 2. **Functional Density**
- Máximo de controles por pixel
- Sem whitespace perdido
- Alinhamento rigoroso

### 3. **Technical Clarity**
- Tipografia mono para dados
- IDs em UUID format
- JSON schemas visíveis
- Timestamps precisos

### 4. **Real-time Feedback**
- Indicadores live (API, DB, Sync)
- Animações responsivas
- Status visual instantâneo

### 5. **Accessibility**
- Contrast ratios WCAG AA+
- Keyboard navigation (Tab)
- Focus indicators (glow)
- Screen reader support

---

## 📊 Performance

### Otimizações Implementadas

✅ CSS-in-JS minimal (puro CSS)
✅ Grid layout (não float/flex complexo)
✅ Backdrop-filter otimizado
✅ Animations via GPU (transform, opacity)
✅ Lazy loading possível (useState)
✅ Responsive design (mobile-first)

### Recomendações

- Use React.memo() para componentes estáticos
- Virtualize logs se exceeder 1000 items
- Minify CSS em produção
- Cache assets no CDN

---

## 🐛 Troubleshooting

### Problema: Glows não aparecem

**Solução**: Verificar se backdrop-filter é suportado
```css
@supports (backdrop-filter: blur(1px)) {
  .pane {
    backdrop-filter: blur(16px);
  }
}
```

### Problema: Fonts não carregam

**Solução**: Importar via @import ou links
```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono" rel="stylesheet">
```

### Problema: Layout quebra em mobile

**Solução**: Media queries já implementadas em AdminDashboard.css

---

## 📚 Referencias Externas

- Colors: https://coolors.co
- Icons: https://phosphoricons.com (or Lucide)
- Glassmorphism: https://glassmorphism.com
- Typography: https://www.jetbrains.com/lp/mono/ & https://rsms.me/inter/

---

## ✅ Checklist de Produção

- [ ] Testar em Chrome, Firefox, Safari
- [ ] Testar em mobile (iOS + Android)
- [ ] Verificar con contrast ratios (aXe)
- [ ] Performance audit (Lighthouse)
- [ ] Build sem erros (pnpm run build)
- [ ] Documentação de componentes
- [ ] Testes unitários (optional)
- [ ] Deploy em produção

---

**Design criado**: 2026-04-07
**Status**: ✅ Production Ready
**Versão**: 2.0 Atomic

Aproveitar! 🚀
