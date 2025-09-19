import React from "react"
import { loadStripe } from "@stripe/stripe-js"

// pega chave pública do .env
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)

function Pagamento({ plano }) {
  const handleCheckout = async () => {
    const stripe = await stripePromise

    // requisita ao backend a sessão de pagamento
    const res = await fetch("http://localhost:5000/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plano })
    })

    const session = await res.json()

    // redireciona para o Stripe Checkout
    const result = await stripe.redirectToCheckout({
      sessionId: session.id
    })

    if (result.error) {
      alert(result.error.message)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#10151e] text-white px-4">
      <div className="bg-gray-900 p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
        <h2 className="text-2xl font-bold mb-6">Pagamento do plano</h2>
        <p className="mb-4">
          Você escolheu o plano:{" "}
          <span className="text-blue-400 font-semibold">{plano}</span>
        </p>

        <button
          onClick={handleCheckout}
          className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold transition"
        >
          Ir para pagamento
        </button>
      </div>
    </div>
  )
}

export default Pagamento
