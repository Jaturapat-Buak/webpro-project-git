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
    else console.log('Connected to database.');
});

app.get('/', (req, res) => {
    const stats = { total: 107, received: 56, dispatched: 34, lowStock: 3 };
    res.render('dashboard', { title: 'แดชบอร์ด', stats, currentRoute: '/' });
});

app.get('/products', (req, res) => {
    const search = req.query.search || '';
    const categoryId = req.query.category || '';

    db.all("SELECT category_id, category_name FROM categories ORDER BY category_id ASC", [], (err, categories) => {
        if (err) return res.status(500).send("Database Error (Categories)");

        let sql = `
            SELECT 
                p.product_id, 
                p.product_name, 
                p.price, 
                c.category_name, 
                COALESCE(s.warehouse_qty, 0) AS stock 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN stock s ON p.product_id = s.product_id
            WHERE 1=1
        `;
        let params = [];

        if (search) {
            sql += " AND p.product_name LIKE ?";
            params.push('%' + search + '%');
        }
        if (categoryId) {
            sql += " AND p.category_id = ?";
            params.push(categoryId);
        }

        sql += "ORDER BY p.category_id ASC, p.product_id ASC";

        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).send("Database Error (Products)");
            
            res.render('products', { 
                title: 'สินค้าทั้งหมด', 
                products: rows, 
                categories: categories, 
                searchQuery: search,    
                selectedCategory: categoryId, 
                currentRoute: '/products' 
            });
        });
    });
});

app.post('/add-product', (req, res) => {
    const { name, category_id, stock, price, description } = req.body;

    db.get("SELECT MAX(product_id) as maxId FROM products", (err, row) => {
        if (err) return res.status(500).send("Database Error");
        
        const nextId = (row && row.maxId) ? row.maxId + 1 : 1;

        const insertProductSql = `INSERT INTO products (product_id, product_name, category_id, price, description) VALUES (?, ?, ?, ?, ?)`;
        db.run(insertProductSql, [nextId, name, category_id, price, description], function(err) {
            if (err) return res.status(500).send("ไม่สามารถเพิ่มสินค้าได้");

            const insertStockSql = `INSERT INTO stock (product_id, warehouse_qty) VALUES (?, ?)`;
            db.run(insertStockSql, [nextId, stock], function(err) {
                if (err) console.error("Stock insert error:", err.message);
                res.redirect('/products');
            });
        });
    });
});

app.get('/product/view/:id', (req, res) => {
    const productId = req.params.id;
    const sql = `
        SELECT p.*, c.category_name, COALESCE(s.warehouse_qty, 0) AS stock 
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN stock s ON p.product_id = s.product_id
        WHERE p.product_id = ?
    `;
    
    db.get(sql, [productId], (err, product) => {
        if (err || !product) return res.status(404).send("ไม่พบข้อมูลสินค้า");
        res.render('view-product', { 
            title: 'รายละเอียดสินค้า', 
            product: product, 
            currentRoute: '/products' 
        });
    });
});

app.get('/product/edit/:id', (req, res) => {
    const productId = req.params.id;
    const sql = `
        SELECT p.*, COALESCE(s.warehouse_qty, 0) AS stock 
        FROM products p
        LEFT JOIN stock s ON p.product_id = s.product_id
        WHERE p.product_id = ?
    `;
    
    db.get(sql, [productId], (err, product) => {
        if (err || !product) return res.status(404).send("ไม่พบข้อมูลสินค้า");
        
        db.all("SELECT category_id, category_name FROM categories ORDER BY category_name ASC", [], (err, categories) => {
            res.render('edit-product', { 
                title: 'แก้ไขข้อมูลสินค้า', 
                product: product, 
                categories: categories,
                currentRoute: '/products' 
            });
        });
    });
});

app.post('/edit-product/:id', (req, res) => {
    const productId = req.params.id;
    const { name, category_id, stock, price, description } = req.body;
    
    const updateProductSql = `UPDATE products SET product_name = ?, category_id = ?, price = ?, description = ? WHERE product_id = ?`;
    db.run(updateProductSql, [name, category_id, price, description || null, productId], function(err) {
        if (err) return res.status(500).send("อัปเดตข้อมูลสินค้าไม่สำเร็จ");
        
        const updateStockSql = `UPDATE stock SET warehouse_qty = ? WHERE product_id = ?`;
        db.run(updateStockSql, [stock, productId], function(err) {
            if (err) console.error("อัปเดตสต็อกไม่สำเร็จ:", err.message);
            res.redirect('/products');
        });
    });
});

app.post('/delete-product', (req, res) => {
    const { productId } = req.body;
    
    if (!productId) return res.status(400).send("ไม่พบรหัสสินค้า");

    db.run(`DELETE FROM stock WHERE product_id = ?`, [productId], function(err) {
        if (err) return res.status(500).send("ลบข้อมูลสต็อกไม่สำเร็จ");

        db.run(`DELETE FROM products WHERE product_id = ?`, [productId], function(err) {
            if (err) return res.status(500).send("ลบข้อมูลสินค้าไม่สำเร็จ");
            res.redirect('/products');
        });
    });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});