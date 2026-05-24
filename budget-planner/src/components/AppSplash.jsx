import { useEffect, useState } from "react";
import "../styles/app-splash.css";

export default function AppSplash({ onFinished }) {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const holdTimer = window.setTimeout(() => {
      setIsLeaving(true);
    }, 2200);

    const finishTimer = window.setTimeout(() => {
      onFinished?.();
    }, 2600);

    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(finishTimer);
    };
  }, [onFinished]);

  return (
    <div className={`app-splash ${isLeaving ? "app-splash--leaving" : ""}`}>
      <section className="app-splash__card" aria-label="FinPath loading screen">
        <div className="app-splash__brand">
          <img
            className="app-splash__logo"
            src="/BudgetApp/brand/finpath-logo-stacked.png"
            alt="FinPath"
          />

          <p className="app-splash__tagline">Track smarter. Save better.</p>
        </div>

        <div className="app-splash__preview">
          <div className="app-splash__metric-card">
            <div className="app-splash__icon">$</div>
            <p>Balance</p>
            <strong>$5,678</strong>
          </div>

          <div className="app-splash__metric-card">
            <p>Savings Goal</p>
            <div className="app-splash__ring">72%</div>
            <span>$30,000</span>
          </div>

          <div className="app-splash__metric-card">
            <p>Budget</p>
            <strong className="app-splash__teal">$293 left</strong>
            <div className="app-splash__bar">
              <span />
            </div>
            <small>Housing · Bills</small>
          </div>

          <div className="app-splash__metric-card">
            <p>Spending</p>
            <div className="app-splash__bars">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>

        <div className="app-splash__loading">
          <div className="app-splash__loading-bar">
            <span />
          </div>
          <p>Loading FinPath...</p>
        </div>

        <footer className="app-splash__footer">
          By Rose & Paw Digital Designs
        </footer>
      </section>
    </div>
  );
}