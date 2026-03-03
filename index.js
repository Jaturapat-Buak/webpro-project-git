const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbPath = path.join(__dirname, 'hardwarehouse.db');
let db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err.message);
    else { console.log('Connected to database.');
    }
});

function logTransaction(productId, type, qty, note) {
db.get("SELECT MAX(transaction_id) as maxId FROM stock_transactions", (err, row) => {
        const nextId = (row && row.maxId) ? row.maxId + 1 : 1;
        const sql = `INSERT INTO stock_transactions (transaction_id, product_id, user_id, transaction_type, quantity, reference_note, transaction_date) 
                     VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`;

        db.run(sql, [nextId, productId, 1, type, qty, note], (err) => {
            if (err) console.error("Log Error:", err.message);
        });
    });
}

// --- หน้า Dashboard พร้อมระบบ ---
app.get('/', (req, res) => {
    const queries = {
        total: "SELECT COUNT(*) as count FROM products",
        received: "SELECT SUM(quantity) as count FROM stock_transactions WHERE transaction_type = 'receive' AND date(transaction_date) = date('now', 'localtime')",
        dispatched: "SELECT SUM(quantity) as count FROM stock_transactions WHERE transaction_type = 'dispatch' AND date(transaction_date) = date('now', 'localtime')",
        lowStock: "SELECT COUNT(*) as count FROM stock WHERE warehouse_qty <= 5",
        categoryStats: `SELECT c.category_name, SUM(COALESCE(s.warehouse_qty, 0)) as total_stock 
                        FROM categories c 
                        LEFT JOIN products p ON c.category_id = p.category_id 
                        LEFT JOIN stock s ON p.product_id = s.product_id 
                        GROUP BY c.category_id`,
        recentLogs: `SELECT t.*, p.product_name FROM stock_transactions t 
                     LEFT JOIN products p ON t.product_id = p.product_id 
                     ORDER BY t.transaction_id DESC LIMIT 10`,
        totalInventory: "SELECT SUM(warehouse_qty) as total FROM stock"
    };

    db.get(queries.total, (err, total) => {
        db.get(queries.received, (err, received) => {
            db.get(queries.dispatched, (err, dispatched) => {
                db.get(queries.lowStock, (err, low) => {
                    db.get(queries.totalInventory, (err, inv) => {
                        db.all(queries.categoryStats, (err, catStats) => {
                            db.all(queries.recentLogs, (err, logs) => {
                                const stats = {
                                    total: total ? total.count : 0,
                                    received: received ? (received.count || 0) : 0,
                                    dispatched: dispatched ? (dispatched.count || 0) : 0,
                                    lowStock: low ? low.count : 0
                                };

                                const totalInventoryCount = inv ? (inv.total || 0) : 0;
                                res.render('dashboard', { 
                                    title: 'แดชบอร์ด', 
                                    stats, 
                                    logs: logs || [], 
                                    catStats: catStats || [], 
                                    totalInventory: totalInventoryCount,
                                    currentRoute: '/' 
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});


// --- หน้า Product (แสดงรายการสินค้า) ---
app.get('/products', (req, res) => {
    const search = req.query.search || '';
    const categoryId = req.query.category || '';
    db.all("SELECT category_id, category_name FROM categories ORDER BY category_id ASC", [], (err, categories) => {
        let sql = `SELECT p.product_id, p.product_name, p.price, c.category_name, COALESCE(s.warehouse_qty, 0) AS stock 
                   FROM products p LEFT JOIN categories c ON p.category_id = c.category_id
                   LEFT JOIN stock s ON p.product_id = s.product_id WHERE 1=1`;
        let params = [];
        if (search) { sql += " AND p.product_name LIKE ?"; params.push('%' + search + '%'); }
        if (categoryId) { sql += " AND p.category_id = ?"; params.push(categoryId); }
        sql += " ORDER BY p.category_id ASC, p.product_id ASC";
        db.all(sql, params, (err, rows) => {
            res.render('products', { title: 'สินค้าทั้งหมด', products: rows, categories, searchQuery: search, selectedCategory: categoryId, currentRoute: '/products' });
        });
    });
});

app.post('/add-product', (req, res) => {
    const { name, category_id, stock, price, description } = req.body;
    db.get("SELECT MAX(product_id) as maxId FROM products", (err, row) => {
        const nextId = (row && row.maxId) ? row.maxId + 1 : 1;
        db.run(`INSERT INTO products (product_id, product_name, category_id, price, description) VALUES (?, ?, ?, ?, ?)`, 
        [nextId, name, category_id, price, description], function(err) {
            db.run(`INSERT INTO stock (product_id, warehouse_qty) VALUES (?, ?)`, [nextId, stock], function(err) {
                logTransaction(nextId, 'add', stock, `เพิ่มสินค้าใหม่: ${name}`);
                res.redirect('/products');
            });
        });
    });
});

app.post('/edit-product/:id', (req, res) => {
    const productId = req.params.id;
    const { name, category_id, stock, price, description } = req.body;
    db.get("SELECT warehouse_qty FROM stock WHERE product_id = ?", [productId], (err, oldData) => {
        const oldStock = oldData ? oldData.warehouse_qty : 0;
        db.run(`UPDATE products SET product_name = ?, category_id = ?, price = ?, description = ? WHERE product_id = ?`,
        [name, category_id, price, description, productId], () => {
            db.run(`UPDATE stock SET warehouse_qty = ? WHERE product_id = ?`, [stock, productId], () => {
                logTransaction(productId, 'adjust', stock, `แก้ไขสินค้า: ${name}`);
                res.redirect('/products');
            });
        });
    });
});

app.post('/delete-product', (req, res) => {
    const { productId } = req.body;
    db.get("SELECT p.product_name, s.warehouse_qty FROM products p LEFT JOIN stock s ON p.product_id = s.product_id WHERE p.product_id = ?", [productId], (err, row) => {
        if (row) {
            db.run(`DELETE FROM stock WHERE product_id = ?`, [productId], () => {
                db.run(`DELETE FROM products WHERE product_id = ?`, [productId], () => {
                    logTransaction(productId, 'issue', row.warehouse_qty, `ลบสินค้า: ${row.product_name}`);
                    res.redirect('/products');
                });
            });
        }
    });
});

app.get('/product/view/:id', (req, res) => {
    const productId = req.params.id;
    const sql = `SELECT p.*, c.category_name, COALESCE(s.warehouse_qty, 0) AS stock 
                 FROM products p LEFT JOIN categories c ON p.category_id = c.category_id
                 LEFT JOIN stock s ON p.product_id = s.product_id WHERE p.product_id = ?`;
    db.get(sql, [productId], (err, product) => {
        res.render('view-product', { title: 'รายละเอียดสินค้า', product, currentRoute: '/products' });
    });
});

app.get('/product/edit/:id', (req, res) => {
    const productId = req.params.id;
    const sql = `SELECT p.*, COALESCE(s.warehouse_qty, 0) AS stock FROM products p
                 LEFT JOIN stock s ON p.product_id = s.product_id WHERE p.product_id = ?`;
    db.get(sql, [productId], (err, product) => {
        db.all("SELECT category_id, category_name FROM categories ORDER BY category_name ASC", [], (err, categories) => {
            res.render('edit-product', { title: 'แก้ไขข้อมูลสินค้า', product, categories, currentRoute: '/products' });
        });
    });
});


// --- หน้า Receive (รับสินค้าเข้าคลัง) ---
app.get('/receive', (req, res) => {
    db.all("SELECT product_id, product_name FROM products ORDER BY product_name ASC", [], (err, products) => {
        res.render('receive', { title: 'รับสินค้าเข้าคลัง', products, currentRoute: '/receive' });
    });
});

app.post('/receive-stock', (req, res) => {
    const { product_id, quantity, supplier } = req.body;
    const updateStockSql = `UPDATE stock SET warehouse_qty = warehouse_qty + ? WHERE product_id = ?`;
    db.run(updateStockSql, [quantity, product_id], function(err) {
        if (err) return res.status(500).send("ไม่สามารถเพิ่มสต็อกได้");

        db.get("SELECT product_name FROM products WHERE product_id = ?", [product_id], (err, product) => {
            const pName = product ? product.product_name : 'Unknown';

            logTransaction(product_id, 'receive', quantity, `รับสินค้าจาก: ${supplier}`);

            res.redirect('/');
        });
    });
});


// --- หน้า Dispatch (เบิกสินค้า) ---
app.get('/dispatch', (req, res) => {
    db.all(`SELECT p.product_id, p.product_name, s.warehouse_qty 
            FROM products p JOIN stock s ON p.product_id = s.product_id 
            WHERE s.warehouse_qty > 0 ORDER BY p.product_name ASC`, [], (err, products) => {
        res.render('dispatch', { title: 'เบิกสินค้าออกจากคลัง', products, currentRoute: '/dispatch' });
    });
});

app.post('/dispatch-stock', (req, res) => {
    const { product_id, quantity, reason } = req.body;
    db.get("SELECT warehouse_qty FROM stock WHERE product_id = ?", [product_id], (err, row) => {
        if (row && row.warehouse_qty >= quantity) {
            db.run(`UPDATE stock SET warehouse_qty = warehouse_qty - ? WHERE product_id = ?`, [quantity, product_id], function(err) {
                if (err) return res.status(500).send("เบิกสินค้าไม่สำเร็จ");
                logTransaction(product_id, 'dispatch', quantity, `เบิกออกเหตุผล: ${reason}`);
                res.redirect('/');
            });
        } else {
            res.status(400).send("จำนวนสินค้าในคลังไม่เพียงพอ");
        }
    });
});

app.listen(port, () => console.log(`Server is running at http://localhost:${port}`));