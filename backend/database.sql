CREATE DATABASE IF NOT EXISTS course_review_db;
USE course_review_db;

-- 用户表
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    -- 在实际应用中，密码必须加密存储！这里用哈希后的字符串，长度要足够。
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('student', 'admin') DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 课程表
CREATE TABLE courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 评价表
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    user_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    content TEXT NOT NULL,
    likes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 点赞关联表 (防止同一用户重复点赞)
CREATE TABLE review_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    review_id INT NOT NULL,
    user_id INT NOT NULL,
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_like (review_id, user_id) -- 唯一约束确保一个用户只能点一次赞
);

-- 插入初始管理员用户 (密码为 'admin123' 的 bcrypt 哈希值)
-- 您应该在首次运行后立即更改此密码！
INSERT INTO users (username, password_hash, role) VALUES
('admin', '$2b$10$YourGeneratedBcryptHashHere', 'admin');

-- 插入一些初始课程
INSERT INTO courses (title, description) VALUES
('Web前端技术', '学习HTML、CSS、JavaScript等前端开发技术，掌握响应式设计和现代前端框架。'),
('人工智能导论', '介绍人工智能的基本概念、发展历程和主要应用，包括机器学习和深度学习基础。'),
('数据结构与算法', '学习基本的数据结构和算法，提高编程能力和解决问题的能力。');