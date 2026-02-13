const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'metrics.db');

class MetricsDB {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH);
    this.initDB();
  }

  initDB() {
    this.db.serialize(() => {
      // Metrics log table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS metrics_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          date TEXT NOT NULL,
          session_key TEXT NOT NULL,
          model TEXT NOT NULL,
          channel TEXT,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          context_used INTEGER DEFAULT 0,
          context_limit INTEGER DEFAULT 200000,
          cost_input REAL DEFAULT 0,
          cost_output REAL DEFAULT 0,
          cost_total REAL DEFAULT 0
        )
      `);

      // Index for faster date range queries
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_date ON metrics_log(date)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_model ON metrics_log(model)`);
    });
  }

  async logMetrics(sessionData) {
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const date = new Date(now).toISOString().split('T')[0]; // YYYY-MM-DD

      const stmt = this.db.prepare(`
        INSERT INTO metrics_log (
          timestamp, date, session_key, model, channel,
          input_tokens, output_tokens, total_tokens,
          context_used, context_limit,
          cost_input, cost_output, cost_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        now,
        date,
        sessionData.sessionId,
        sessionData.model,
        sessionData.channel,
        sessionData.inputTokens || 0,
        sessionData.outputTokens || 0,
        sessionData.totalTokens || 0,
        sessionData.totalTokens || 0,
        sessionData.contextTokens || 200000,
        sessionData.costInput || 0,
        sessionData.costOutput || 0,
        sessionData.costTotal || 0,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );

      stmt.finalize();
    });
  }

  async getMetricsByDateRange(startDate, endDate) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          date,
          model,
          SUM(input_tokens) as total_input,
          SUM(output_tokens) as total_output,
          SUM(total_tokens) as total_tokens,
          SUM(cost_input) as total_cost_input,
          SUM(cost_output) as total_cost_output,
          SUM(cost_total) as total_cost,
          COUNT(*) as request_count
        FROM metrics_log
        WHERE date BETWEEN ? AND ?
        GROUP BY date, model
        ORDER BY date DESC, model
      `;

      this.db.all(query, [startDate, endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getModelSummary(startDate, endDate) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          model,
          SUM(input_tokens) as total_input,
          SUM(output_tokens) as total_output,
          SUM(total_tokens) as total_tokens,
          SUM(cost_input) as total_cost_input,
          SUM(cost_output) as total_cost_output,
          SUM(cost_total) as total_cost,
          COUNT(*) as request_count,
          MIN(date) as first_seen,
          MAX(date) as last_seen
        FROM metrics_log
        WHERE date BETWEEN ? AND ?
        GROUP BY model
        ORDER BY total_cost DESC
      `;

      this.db.all(query, [startDate, endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getDailySummary(startDate, endDate) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          date,
          SUM(input_tokens) as total_input,
          SUM(output_tokens) as total_output,
          SUM(total_tokens) as total_tokens,
          SUM(cost_total) as total_cost,
          COUNT(DISTINCT model) as models_used,
          COUNT(*) as request_count
        FROM metrics_log
        WHERE date BETWEEN ? AND ?
        GROUP BY date
        ORDER BY date DESC
      `;

      this.db.all(query, [startDate, endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = MetricsDB;
