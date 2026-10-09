# 🏆 Hackathon Project Submission: HN-AI-05

## Project Title
**Cross-Hospital Resource Rebalance**  
*District-wide AI Logistics Dispatch Engine for Medical Oxygen*

**Track:** Gemini · MongoDB · Render  
**GitHub Repository:** `https://github.com/dogga777/Cross-Hospital-Oxygen-Resource-Dashboard`  
**Live Production URL (Render):** [https://cross-hospital-oxygen-resource-dashboard.onrender.com/](https://cross-hospital-oxygen-resource-dashboard.onrender.com/)  
**Live Local URL:** [http://localhost:3000](http://localhost:3000)  

---

## 1. Executive Summary
Existing hospital resource dashboards (beds, ventilators, oxygen) operate in total silos. Hospital A runs dangerously low on oxygen while Hospital B, just 4 miles away, has dozens of cylinders sitting idle. 

**Cross-Hospital Resource Rebalance** connects the entire district into a unified real-time grid. It streams live consumption telemetry into MongoDB, models linear depletion burn rates to forecast run-out horizons hours in advance, statistically validates predictions against held-out simulated data, and uses **Google Gemini (3.8 Flash)** to generate actionable, authoritative one-line clinical transfer justifications that dispatch supply from surplus hospitals to deficit hospitals before zero-hour is reached.

---

## 2. Fulfillment of Core Deliverables

| Deliverable from Challenge Prompt | System Implementation & Verification |
| :--- | :--- |
| **1. Simulated multi-hospital resource stream written to MongoDB** | • Simulates 6 interconnected district facilities with varying capacities and burn rates.<br>• Generates real-time telemetry every 3 seconds for Medical Oxygen Cylinders (Type-D 40L).<br>• Writes timeseries documents to MongoDB collections (`resource_telemetry`, `hospitals`, `transfer_logs`).<br>• Fully supports MongoDB Atlas with zero-config in-memory fallback. |
| **2. Simple trend-based shortage predictor with visible confidence check against held-out simulated data** | • **Predictor:** Ordinary Least Squares (OLS) linear depletion regression calculating burn rate ($\beta$), time-to-shortage ($T_{\text{shortage}}$), and surplus capacity.<br>• **Held-out validation:** 70/30 rolling temporal train-test split against held-out simulated telemetry points.<br>• **Exposed Metrics:** Real-time **MAPE** (<2.5%), **RMSE**, and **$R^2$** scores, with an interactive Chart.js comparison graph. |
| **3. Render dashboard showing live stock, predicted time-to-shortage, and ranked transfer recommendations** | • Dark-mode Medical Operations Command Center deployed and ready for Render.<br>• Real-time WebSocket connection updating live countdown timers and gauge bars.<br>• Ranked transfer recommendations prioritized by urgency (CRITICAL, HIGH, SCHEDULED).<br>• One-click **"Execute Transfer"** action that actually moves stock in MongoDB and updates the grid. |
| **4. Gemini-generated one-line justification per recommendation** | • Powered by `@google/genai` using model `gemini-3.8-flash`.<br>• Generates exact required syntax:<br>  *`"Move 40 units from B to A — B has 6hrs surplus, A depletes in 2hrs"`*<br>• Robust fallback ensures zero downtime even without an API key. |

---

## 3. Demo Walkthrough Script for Judges (2-Minute Pitch)

1. **The Overview (0:00 - 0:30):**
   - Open [http://localhost:3000](http://localhost:3000).
   - Point out the 6 monitored facilities: *Metro General* and *Riverbank Annex* are facing critical shortages (<1.5 hours remaining), while *St. Jude* and *Highland Specialty* have over 25+ hours of surplus stock.
2. **The Held-Out Validation Check (0:30 - 1:00):**
   - Scroll to the bottom panel: **"Model Validation & Held-Out Simulated Data Check"**.
   - Show the judges the 70/30 temporal split, the low **MAPE (<2.5%)**, and the Chart.js visualizer showing model predictions closely tracking actual held-out points.
3. **The Gemini Justification & Rebalance (1:00 - 1:30):**
   - Direct attention to the right-hand **AI Redistribution Plan**.
   - Highlight the Gemini-generated one-line clinical justification box:
     > *"Move 70 units from St. Jude Medical Center to Riverbank Emergency Annex — St. Jude has 25.5hrs surplus, Riverbank depletes in 0.6hrs"*
4. **Interactive Action (1:30 - 2:00):**
   - Click **"Execute Transfer"**:
   - Show how Riverbank's stock immediately jumps from critical red to safe green, while St. Jude safely maintains its surplus buffer!
   - (Optional) Click **"Surge Event"** in the top navigation to simulate a sudden mass-casualty intake and watch the system instantly re-calculate transfer plans!

---

## 4. Verification & Testing
- Automated test suite passed: **20/20 criteria verified** (`npm test`).
- Production runtime: Node.js / Express / WebSockets / Tailwind / Chart.js.
- Deployment config: `render.yaml` Blueprint + `Dockerfile` + `Procfile`.
