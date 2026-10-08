# HN-AI-05: Cross-Hospital Resource Rebalance

> **Track:** Gemini &middot; MongoDB &middot; Render  
> **District Command:** Metro District 04 &mdash; Critical Oxygen Logistics Grid

---

## 🎯 The Problem

Existing hospital bed, oxygen, and ventilator dashboards only show each hospital's stock in isolation. Nobody is looking across hospitals within the same district to see that **Hospital A is about to run short within hours**, while **Hospital B has surplus capacity sitting unused right now**.

During healthcare surges and supply chain stress, isolation leads to avoidable stockouts. 

---

## 💡 The Solution

**Cross-Hospital Resource Rebalance** is an intelligent, real-time logistics operations center that:

1. **Streams Live Telemetry to MongoDB**: Simulates 6 interconnected district hospitals monitoring medical oxygen cylinders (Type-D 40L) updated every few seconds.
2. **Predicts Shortage Horizons via Trend Models**: Uses Ordinary Least Squares (OLS) linear depletion regression to calculate exact run-out times ($T_{\text{shortage}}$) and surplus runways ($T_{\text{surplus}}$).
3. **Validates Predictor on Held-Out Simulated Data**: Continuously executes a 70/30 temporal train-test split against held-out simulated data, visibly exposing **MAPE** (Mean Absolute Percentage Error), **RMSE**, and statistical confidence ratings on the dashboard.
4. **Optimizes Ranked Transfer Recommendations**: Computes a redistribution plan factoring in recipient urgency, donor safety reserve buffers, transit distances, and deadline windows.
5. **Generates Gemini One-Line Clinical Justifications**: Leverages Google Gemini (`gemini-3.8-flash`) to produce crisp, actionable dispatch justifications in the exact required syntax:
   > *"Move 40 units from B to A — B has 6hrs surplus, A depletes in 2hrs"*
6. **Executes Live Transfers**: Dispatches redistribution with one click, immediately transferring stock in MongoDB and rebalancing the district.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Simulated Telemetry Stream Engine                    │
│      (Metro General, St. Jude, Riverbank, Oak Valley, Mercy, Highland)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Ticks every 3s
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          MongoDB Storage                               │
│     - resource_telemetry: Timeseries stream documents                  │
│     - hospitals: Master fleet state & baseline burn rates              │
│     - transfer_logs: Executed rebalance audit trail                    │
│     - model_evaluations: Backtesting metrics logs                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌───────────────────────────────┐           ┌────────────────────────────────┐
│   Linear Depletion Predictor  │           │   Held-Out Validation Engine   │
│ - OLS Linear Regression Slope │           │ - 70% Train / 30% Held-Out     │
│ - Time-to-Shortage (hours)    │           │ - MAPE, RMSE, R² Metrics       │
│ - Surplus Runway & Buffer     │           │ - Actual vs Predicted Series   │
└───────────────┬───────────────┘           └────────────────┬───────────────┘
                │                                            │
                └─────────────────────┬──────────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│               District Rebalance Optimization & Ranking                │
│    - Ranks transfers by urgency (CRITICAL < 2h, HIGH < 3.5h)           │
│    - Optimizes donor selection via distance & surplus adequacy         │
│    - Guarantees donor safety buffer (≥ 6h runway retained)             │
└─────────────────────────────────────┬──────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Google Gemini AI Integration                       │
│    Model: gemini-3.8-flash (via @google/genai)                         │
│    Output: Crisp one-line clinical dispatch justification:             │
│    "Move 40 units from B to A — B has 6hrs surplus, A depletes in 2hrs" │
└─────────────────────────────────────┬──────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│              Render-Ready Real-Time Web Operations Dashboard            │
│  - Live WebSocket Telemetry Stream & Countdown Timers                  │
│  - Interactive Rebalance Cards with "Execute Transfer" Action          │
│  - Chart.js Held-Out Model Validation & District Trend Visualizers     │
│  - Live Surge Injection & Emergency Delivery Controls                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Monitored District Hospital Fleet

| ID | Hospital Facility | Role | Capacity | Normal Burn Rate | Initial Condition |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HOSP-01` | **Metro General Hospital** | Level 1 Trauma Center | 350 cyl | 22.5 cyl/h | Acute Shortage Warning (~1.5h runway) |
| `HOSP-02` | **St. Jude Medical Center** | Tertiary Care & Teaching | 320 cyl | 7.2 cyl/h | Surplus Donor (~25h runway) |
| `HOSP-03` | **Riverbank Emergency Annex** | Emergency Overflow Ward | 160 cyl | 14.8 cyl/h | Imminent Zero Stock (~0.8h runway) |
| `HOSP-04` | **Oak Valley Community** | Suburban Community Care | 200 cyl | 3.8 cyl/h | Stable Surplus Donor (~38h runway) |
| `HOSP-05` | **Mercy Urban Care** | Urban Acute Clinic | 220 cyl | 11.4 cyl/h | Moderate Stock (~7h runway) |
| `HOSP-06` | **Highland Specialty Institute** | Elective & Specialty | 180 cyl | 2.1 cyl/h | High Reserve Donor (~60h runway) |

---

## 🚀 Quick Start (Local Setup)

### Prerequisites
- Node.js (v18+)
- (Optional) MongoDB connection string (Atlas or local)
- (Optional) Google Gemini API Key

### 1. Clone & Install
```bash
cd cross-hospital-rebalance
npm install
```

### 2. Environment Configuration
Copy the template configuration:
```bash
cp .env.example .env
```

Edit `.env` (or configure in the dashboard Settings UI):
```env
PORT=3000
MONGODB_URI=        # Leave blank for zero-config embedded MongoDB store
GEMINI_API_KEY=     # Optional: your Gemini API key
```

> **Zero-Config Guarantee**: If `MONGODB_URI` or `GEMINI_API_KEY` are not provided, the application automatically uses the embedded in-memory MongoDB engine and compliant clinical heuristic generator. It never crashes and works immediately out of the box!

### 3. Run Automated Tests
```bash
npm test
```
All 20 verification tests validate the database, predictor, held-out model accuracy, rebalancing optimization, and Gemini justification formatting.

### 4. Start the Application
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to access the Medical Logistics Command Center.

---

## ☁️ Deploying to Render

This application is engineered specifically for **Render**:

### Method 1: Using `render.yaml` (Recommended)
1. Push this repository to GitHub or GitLab.
2. In the Render Dashboard, click **New +** &rarr; **Blueprint**.
3. Select your repository. Render automatically reads [`render.yaml`](./render.yaml) and provisions the Web Service.
4. Add environment variables in Render:
   - `GEMINI_API_KEY`: *(Your Google AI Studio API key)*
   - `MONGODB_URI`: *(Your MongoDB Atlas connection URI)*

### Method 2: Manual Web Service
1. In Render, select **New +** &rarr; **Web Service**.
2. Set:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Add environment variables under the **Environment** tab:
   - `PORT`: `10000`
   - `NODE_ENV`: `production`
   - `GEMINI_API_KEY`: `your_key`
   - `MONGODB_URI`: `your_mongo_uri`

---

## 🔬 Mathematical Prediction & Held-Out Validation

### 1. Linear Depletion Predictor
Using Ordinary Least Squares (OLS) regression over recent telemetry points $(t_i, S_i)$:
$$\text{Depletion Rate } \beta = -\frac{\sum (t_i - \bar{t})(S_i - \bar{S})}{\sum (t_i - \bar{t})^2} \quad (\text{cylinders/hour})$$

$$\text{Time to Critical Shortage: } T_{\text{shortage}} = \max\left(0, \frac{S_{\text{current}} - S_{\text{critical}}}{\beta}\right)$$

### 2. Visible Held-Out Validation Check
To provide transparent proof of model fidelity:
- A rolling window of historical telemetry is split into **70% Training** and **30% Held-Out Test**.
- The linear model is fitted strictly on the 70% training subset.
- Stock is predicted across the held-out sample timestamps.
- The system computes:
  - **Mean Absolute Percentage Error (MAPE)**:
    $$\text{MAPE} = \frac{100\%}{K} \sum_{i=1}^K \left|\frac{S_{\text{actual}, i} - \hat{S}_{\text{predicted}, i}}{S_{\text{actual}, i}}\right|$$
  - **Root Mean Square Error (RMSE)**:
    $$\text{RMSE} = \sqrt{\frac{1}{K}\sum_{i=1}^K (S_{\text{actual}, i} - \hat{S}_{\text{predicted}, i})^2}$$
  - **Confidence Rating**: Exposed visibly on the KPI banner and interactive Chart.js validation graph!

---

## 🤖 Gemini AI Justifications

Each recommended transfer is passed to **Google Gemini** (`gemini-3.8-flash` via `@google/genai`) to generate a punchy clinical justification:

**Example Gemini Output:**
> *"Move 40 units from St. Jude Medical Center to Metro General Hospital — St. Jude has 25.5hrs surplus, Metro General depletes in 1.2hrs"*

The AI synthesizes:
- Donor surplus capacity and remaining buffer
- Recipient burn rate and remaining depletion runway
- Logistics transit time and urgency window

---

## 📡 REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/status` | `GET` | System health, database engine, Gemini status, and connected clients |
| `/api/hospitals` | `GET` | Current state of all 6 hospitals |
| `/api/predictions` | `GET` | Shortage predictions ($T_{\text{shortage}}$, burn rate, transferable units) |
| `/api/recommendations` | `GET` | Ranked transfer plans with Gemini justifications |
| `/api/validation` | `GET` | Held-out simulated data accuracy report (MAPE, RMSE, $R^2$) |
| `/api/telemetry/recent` | `GET` | Recent telemetry timeseries points |
| `/api/transfers/execute` | `POST` | Execute transfer: `{ donorId, recipientId, quantity, justification }` |
| `/api/simulation/control`| `POST` | Simulator controls: `{ action: 'start' \| 'pause' \| 'reset', intervalMs }` |
| `/api/simulation/surge`  | `POST` | Inject mass-casualty surge: `{ hospitalId, multiplier }` |
| `/api/config/update`     | `POST` | Dynamically update Gemini key or MongoDB URI from UI |
| `/ws`                    | `WS`  | Real-time WebSocket telemetry and recommendation broadcast |

---

## 📄 License
MIT License. Built for the **Gemini &middot; MongoDB &middot; Render** Hackathon Challenge (HN-AI-05).
