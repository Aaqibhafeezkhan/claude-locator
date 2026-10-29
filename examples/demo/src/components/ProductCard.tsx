import { memo } from 'react'

type ProductCardProps = { name: string; price: number; tag?: string }

export const ProductCard = memo(function ProductCard({ name, price, tag }: ProductCardProps) {
  return (
    <article className="card">
      <div className="card-image" aria-hidden="true" />
      {tag ? <span className="badge">{tag}</span> : null}
      <h3>{name}</h3>
      <p className="price">${price}</p>
      <button type="button" className="button">
        Add to cart
      </button>
    </article>
  )
})
