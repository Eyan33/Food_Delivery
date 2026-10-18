/* =========================================================
   ADMIN PANEL
========================================================= */

.admin-message {
  display: none;
  margin: 16px 30px 0;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  box-sizing: border-box;
}

.admin-message.show {
  display: block;
}

.admin-message.error {
  background: #fff1f2;
  border-color: #fecdd3;
  color: #9f1239;
}

.admin-message.success {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.admin-message.warning {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #9a5b00;
}

.admin-main {
  min-height: 100vh;

  margin-left: 250px;

  background: var(--background);

  transition: margin-left 0.25s ease;
}
