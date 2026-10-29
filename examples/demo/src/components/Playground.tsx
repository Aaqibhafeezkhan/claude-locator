import { Counter } from './Counter'
import { ProductCard } from './ProductCard'

const PRODUCTS = [
  { name: 'Trail runner', price: 129, tag: 'New' },
  { name: 'Rain shell', price: 189 },
  { name: 'Day pack', price: 79, tag: 'Sale' },
]

export function Playground() {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="eyebrow">localhost:5173</span>
        <span className="status">dev server</span>
      </div>
      <div className="shop">
        <h2>Try it here</h2>
        <div className="grid">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.name} {...product} />
          ))}
        </div>
        <Counter />
      </div>
    </div>
  )
}
