import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div className="counter">
      <span>Items in cart: {count}</span>
      <button type="button" className="button ghost" onClick={() => setCount(count + 1)}>
        +1
      </button>
    </div>
  )
}
