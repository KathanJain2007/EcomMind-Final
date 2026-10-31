import { LOGISTICS_QUOTES, PRODUCTS, RETURNS_BY_PINCODE, SUPPLIER_QUOTES, SUPPLIERS, salesInRange } from '@/data/demo'

/** Generates realistic sample rows for each importable dataset (used for samples + quick-fill). */
export function downloadSampleRows(slotKey: string): Record<string, string>[] {
  switch (slotKey) {
    case 'products':
      return PRODUCTS.map((p) => ({
        sku: p.sku, name: p.name, category: p.category, price: String(p.price),
        cost: String(p.cost), stock: String(p.stock), avg_daily_sales: String(p.avgDailySales),
      }))
    case 'sales':
      return salesInRange(14).slice(0, 70).map((r) => ({ date: r.date, sku: r.sku, units: String(r.units) }))
    case 'returns':
      return RETURNS_BY_PINCODE.map((r) => ({
        pincode: r.pincode, sku: r.sku, orders: String(r.orders), returns: String(r.returns),
      }))
    case 'suppliers':
      return SUPPLIER_QUOTES.map((q) => ({
        supplier: SUPPLIERS.find((s) => s.id === q.supplierId)?.name.split('—')[0].trim() ?? q.supplierId,
        sku: q.sku, unit_price: String(q.unitPrice), delivery_days: String(q.deliveryDays),
      }))
    case 'logistics':
      return LOGISTICS_QUOTES.map((q) => ({
        courier: q.courier, cost_per_500g: String(q.costPer500g), eta_days: String(q.etaDays),
      }))
    case 'mandate':
      return [
        { daily_budget: '75000', max_order_value: '60000', max_per_call_cost: '10' },
      ]
    default:
      return []
  }
}
