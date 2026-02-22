const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const port = 3000;
const session = require("express-session");

// connect database
let db = new sqlite3.Database("./hardwareStore.db", (err) => {
  if (err) return console.error(err.message);
  console.log("Connected to SQLite database.");
});

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: true,
  }),
);

app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/login.html");
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username, password],
    (err, user) => {
      if (err) return res.send("DB error");
      if (!user) return res.send("Login failed");
      // เก็บ session
      req.session.user = user;
      // redirect ตาม role
      if (user.role === "admin") return res.redirect("/admin");
      if (user.role === "warehousestaff") return res.redirect("/warehouse");
      if (user.role === "salestaff") return res.redirect("/sales");
    },
  );
});

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect("/login");
    if (req.session.user.role !== role) return res.send("Access denied");
    next();
  };
}

function requireAnyRole(roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect("/login");
    if (!roles.includes(req.session.user.role))
      return res.send("Access denied");
    next();
  };
}

app.get("/admin", requireRole("admin"), (req, res) => {
  res.send("Admin dashboard");
});

app.get("/warehouse", requireRole("warehousestaff"), (req, res) => {
  res.send("Warehouse dashboard");
});

app.get("/sales", requireRole("salestaff"), (req, res) => {
  res.send("Sales dashboard");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/manage", (req, res) => {
  const search = req.query.search || "";

  let sql = `
    SELECT 
      CATEGORY_ID,
      CATEGORY_NAME,
      PRODUCT_ID,
      PRODUCT_NAME,
      SUM(QUANTITY) AS QUANTITY,
      AVG(LIST_PRICE) AS LIST_PRICE
    FROM hardwareStores
  `;

  let params = [];

  if (search) {
    sql += " WHERE PRODUCT_NAME LIKE ?";
    params.push("%" + search + "%");
  }

  sql += `
    GROUP BY CATEGORY_ID, CATEGORY_NAME, PRODUCT_ID, PRODUCT_NAME
    ORDER BY CATEGORY_ID ASC, PRODUCT_ID ASC
  `;

  db.all(sql, params, (err, rows) => {
    if (err) return console.log(err.message);
    res.render("show", { data: rows, search });
  });
});

app.listen(port, () => {
  console.log("Server started at http://localhost:3000");
});
