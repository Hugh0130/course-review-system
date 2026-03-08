require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 数据库连接池
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// JWT 密钥
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_super_secret_key_change_this';

// 辅助函数: 验证 JWT Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: '访问令牌缺失' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '无效的访问令牌' });
        }
        req.user = user;
        next();
    });
};

// 辅助函数: 验证管理员权限
const authorizeAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
};

// ==================== API 路由 ====================

// 1. 用户注册
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码为必填项' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hashedPassword]
        );
        res.status(201).json({ message: '用户注册成功', userId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: '用户名已存在' });
        } else {
            console.error('注册错误:', error);
            res.status(500).json({ error: '服务器内部错误' });
        }
    }
});

// 2. 用户登录
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码为必填项' });
    }

    try {
        const [rows] = await pool.execute('SELECT id, username, password_hash, role FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: '登录成功',
            token,
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 3. 获取所有课程 (分页)
app.get('/api/courses', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    try {
        let query = `
            SELECT c.*,
                   COUNT(r.id) as review_count,
                   IFNULL(AVG(r.rating), 0) as avg_rating,
                   IFNULL(SUM(r.likes), 0) as total_likes
            FROM courses c
            LEFT JOIN reviews r ON c.id = r.course_id
        `;
        let countQuery = `SELECT COUNT(*) as total FROM courses c`;
        const params = [];
        const countParams = [];

        if (search) {
            query += ` WHERE c.title LIKE ? OR c.description LIKE ?`;
            countQuery += ` WHERE c.title LIKE ? OR c.description LIKE ?`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
            countParams.push(searchTerm, searchTerm);
        }

        query += ` GROUP BY c.id ORDER BY total_likes DESC, c.id ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [courses] = await pool.execute(query, params);
        const [countResult] = await pool.execute(countQuery, countParams);
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        res.json({
            courses,
            pagination: { page, limit, total, totalPages }
        });
    } catch (error) {
        console.error('获取课程错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 4. 获取单个课程的详情及评价
app.get('/api/courses/:id', authenticateToken, async (req, res) => {
    const courseId = req.params.id;
    try {
        // 获取课程基本信息
        const [courseRows] = await pool.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
        if (courseRows.length === 0) {
            return res.status(404).json({ error: '课程未找到' });
        }
        const course = courseRows[0];

        // 获取该课程的所有评价，并标记当前用户是否点过赞
        const [reviews] = await pool.execute(`
            SELECT r.*, u.username,
                   EXISTS(SELECT 1 FROM review_likes rl WHERE rl.review_id = r.id AND rl.user_id = ?) as user_liked
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.course_id = ?
            ORDER BY r.likes DESC, r.created_at DESC
        `, [req.user.id, courseId]);

        res.json({ course, reviews });
    } catch (error) {
        console.error('获取课程详情错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 5. 创建评价
app.post('/api/courses/:id/reviews', authenticateToken, async (req, res) => {
    const courseId = req.params.id;
    const { rating, content } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5 || !content || content.trim() === '') {
        return res.status(400).json({ error: '评分(1-5)和评价内容为必填项' });
    }

    try {
        const [result] = await pool.execute(
            'INSERT INTO reviews (course_id, user_id, rating, content) VALUES (?, ?, ?, ?)',
            [courseId, userId, rating, content.trim()]
        );
        res.status(201).json({ message: '评价提交成功', reviewId: result.insertId });
    } catch (error) {
        console.error('提交评价错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 6. 为评价点赞/取消点赞
app.post('/api/reviews/:id/like', authenticateToken, async (req, res) => {
    const reviewId = req.params.id;
    const userId = req.user.id;
    const action = req.body.action; // 'like' 或 'unlike'

    try {
        await pool.execute('START TRANSACTION');

        if (action === 'like') {
            // 尝试插入点赞记录
            await pool.execute(
                'INSERT IGNORE INTO review_likes (review_id, user_id) VALUES (?, ?)',
                [reviewId, userId]
            );
            // 更新评价的点赞数
            await pool.execute(
                'UPDATE reviews SET likes = likes + 1 WHERE id = ?',
                [reviewId]
            );
        } else if (action === 'unlike') {
            // 删除点赞记录
            const [deleteResult] = await pool.execute(
                'DELETE FROM review_likes WHERE review_id = ? AND user_id = ?',
                [reviewId, userId]
            );
            if (deleteResult.affectedRows > 0) {
                // 更新评价的点赞数
                await pool.execute(
                    'UPDATE reviews SET likes = likes - 1 WHERE id = ? AND likes > 0',
                    [reviewId]
                );
            }
        } else {
            await pool.execute('ROLLBACK');
            return res.status(400).json({ error: '无效的操作' });
        }

        await pool.execute('COMMIT');
        // 返回更新后的点赞数
        const [updatedReview] = await pool.execute('SELECT likes FROM reviews WHERE id = ?', [reviewId]);
        res.json({ message: '操作成功', likes: updatedReview[0].likes });
    } catch (error) {
        await pool.execute('ROLLBACK');
        console.error('点赞操作错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 7. 管理员删除评价
app.delete('/api/reviews/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    const reviewId = req.params.id;
    try {
        const [result] = await pool.execute('DELETE FROM reviews WHERE id = ?', [reviewId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '评价未找到' });
        }
        res.json({ message: '评价删除成功' });
    } catch (error) {
        console.error('删除评价错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 8. 获取当前用户信息
app.get('/api/me', authenticateToken, async (req, res) => {
    res.json({ user: req.user });
});

// 启动服务器
app.listen(port, () => {
    console.log(`后端服务器运行在 http://localhost:${port}`);
});