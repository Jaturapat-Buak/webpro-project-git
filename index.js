const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");

const app = express();
const port = 3000;

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

app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const role = req.session.user.role;

  if (role === "admin") return res.redirect("/admin");
  if (role === "warehousestaff") return res.redirect("/warehouse");
  if (role === "salestaff") return res.redirect("/sales");

  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.sendFile("login.html", { root: "public" });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username, password],
    (err, user) => {
      if (err) return res.send("DB error");
      if (!user) return res.send("Login failed");

      req.session.user = user;

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

app.get("/admin", requireRole("admin"), (req, res) => {
  res.render("admin-dashboard");
});

app.get("/warehouse", requireRole("warehousestaff"), (req, res) => {
  res.render("warehouse-dashboard");
});

app.get("/sales", requireRole("salestaff"), (req, res) => {
  res.render("sale-dashboard");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/manageproduct", requireLogin, (req, res) => {
  const search = req.query.search || "";

  let sql = `
    SELECT *
    FROM hardwareStores
  `;

  let params = [];

  if (search) {
    sql += " WHERE PRODUCT_NAME LIKE ?";
    params.push("%" + search + "%");
  }

  sql += " ORDER BY CATEGORY_ID, PRODUCT_ID";

  db.all(sql, params, (err, rows) => {
    if (err) return console.log(err.message);
    res.render("manageproduct", {
      data: rows,
      search,
      role: req.session.user.role
    });
  });
});

app.get("/manageusers", requireLogin, (req, res) => {
  let sql = `
    SELECT * FROM users
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return console.log(err.message);
    res.render("manageusers", { data: rows });
  });
});

app.get("/manageuser/:id", requireLogin, (req, res) => {
  const id = req.params.id;

  db.get("SELECT * FROM users WHERE id=?", [id], (err, user) => {
    if (err) return res.send("DB error");
    if (!user) return res.send("User not found");

    res.render("edituser", { user });
  });
});

app.post("/manageuser/:id", requireLogin, (req, res) => {
  const id = req.params.id;
  const { role } = req.body;

  db.run(
    "UPDATE users SET role=? WHERE id=?",
    [role, id],
    (err) => {
      if (err) return res.send("Update failed");
      res.redirect("/manageusers");
    }
  );
});

app.get("/manageproduct/:categoryId/:productId", requireLogin, (req, res) => {
  const { categoryId, productId } = req.params;

  db.get(
    "SELECT * FROM hardwareStores WHERE CATEGORY_ID=? AND PRODUCT_ID=?",
    [categoryId, productId],
    (err, product) => {
      if (err) return res.send("DB error");
      if (!product) return res.send("Product not found");

      res.render("editproduct", { product: product }); // ✅ แก้ตรงนี้
    }
  );
});

app.post("/manageproduct/:categoryId/:productId", requireLogin, (req, res) => {

  const { categoryId, productId } = req.params;
  const { product_name, category_name, price, quantity } = req.body;

  db.run(`
    UPDATE hardwareStores
    SET
      PRODUCT_NAME = ?,
      CATEGORY_NAME = ?,
      LIST_PRICE = ?,
      QUANTITY = ?
    WHERE CATEGORY_ID = ? AND PRODUCT_ID = ?
  `,
  [product_name, category_name, price, quantity, categoryId, productId],
  (err) => {
    if (err) return res.send("Update failed");
    res.redirect("/manageproduct");
  });

});

app.listen(port, () => {
  console.log("Server started at http://localhost:3000");
});
