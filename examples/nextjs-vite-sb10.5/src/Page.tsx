import { useState } from "react";
import "./ledgerline.css";
import { Header } from "./Header.js";

// Derived from Storybook's official scaffold Page: header plus content, with
// the same login-state mechanics — restyled as the Ledgerline dashboard.
// Every figure is a fixed literal: these components exist to be screenshot,
// so nothing here derives from time, locale, or randomness.

const STATS = [
  {
    label: "Outstanding",
    value: "$48,250.00",
    delta: "+4.2%",
    direction: "up" as const,
    points: "0,20 12,16 24,17 36,12 48,13 60,8 72,9 80,4",
  },
  {
    label: "Paid this month",
    value: "$126,900.00",
    delta: "+11.8%",
    direction: "up" as const,
    points: "0,22 12,19 24,14 36,15 48,10 60,11 72,6 80,2",
  },
  {
    label: "Overdue",
    value: "$7,410.00",
    delta: "-2.1%",
    direction: "down" as const,
    points: "0,6 12,9 24,8 36,13 48,12 60,17 72,16 80,21",
  },
];

const ACTIVITY = [
  {
    client: "Meridian Press",
    invoice: "INV-1047",
    amount: "$12,400.00",
    status: "paid" as const,
  },
  {
    client: "Hollis & Vane",
    invoice: "INV-1046",
    amount: "$3,150.00",
    status: "sent" as const,
  },
  {
    client: "Fernwood Studio",
    invoice: "INV-1045",
    amount: "$8,900.00",
    status: "paid" as const,
  },
  {
    client: "Cartwright Co.",
    invoice: "INV-1042",
    amount: "$4,720.00",
    status: "overdue" as const,
  },
  {
    client: "Ostrander Ltd.",
    invoice: "INV-1041",
    amount: "$21,080.00",
    status: "sent" as const,
  },
];

export function Page() {
  const [user, setUser] = useState<{ name: string } | undefined>(undefined);

  return (
    <div className="ll-page">
      <Header
        user={user}
        onLogin={() => setUser({ name: "Ada Lovelace" })}
        onLogout={() => setUser(undefined)}
        onCreateAccount={() => setUser({ name: "Ada Lovelace" })}
      />
      <main className="ll-page__main">
        <h2 className="ll-page__headline">The morning ledger</h2>
        <p className="ll-page__subline">
          Every invoice, balanced to the cent — as of close of business
          yesterday.
        </p>

        <div className="ll-stats">
          {STATS.map((stat) => (
            <section key={stat.label} className="ll-stat">
              <h3 className="ll-stat__label">{stat.label}</h3>
              <div className="ll-stat__row">
                <span className="ll-stat__value">{stat.value}</span>
                <span className={`ll-badge ll-badge--${stat.direction}`}>
                  {stat.delta}
                </span>
              </div>
              <svg
                aria-hidden
                className={`ll-stat__spark${stat.direction === "down" ? " ll-stat__spark--down" : ""}`}
                fill="none"
                height="24"
                viewBox="0 0 80 24"
                width="80"
              >
                <polyline
                  points={stat.points}
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </section>
          ))}
        </div>

        <h3 className="ll-page__section-title">Recent activity</h3>
        <table className="ll-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Invoice</th>
              <th className="ll-table__amount">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ACTIVITY.map((row) => (
              <tr key={row.invoice}>
                <td>{row.client}</td>
                <td className="ll-table__invoice">{row.invoice}</td>
                <td className="ll-table__amount">{row.amount}</td>
                <td>
                  <span className={`ll-badge ll-badge--${row.status}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
