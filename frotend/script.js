// API 基础地址 - 在本地开发时指向后端服务器，部署时需要修改
const API_BASE_URL = 'http://localhost:3001/api';
// 在 Render 部署时，应该类似: const API_BASE_URL = 'https://your-backend-service.onrender.com/api';

// 应用状态
let currentUser = null;
let currentPage = 1;
const coursesPerPage = 6;
let currentCourseId = null;
let currentRating = 0;

// DOM 元素
const coursesContainer = document.getElementById('courses-container');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const showAllBtn = document.getElementById('show-all');
const sortPopularBtn = document.getElementById('sort-popular');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const currentPageSpan = document.getElementById('current-page');
const totalPagesSpan = document.getElementById('total-pages');
const loginBtn = document.getElementById('login-btn');
const usernameInput = document.getElementById('username');
const userWelcome = document.getElementById('user-welcome');
const currentUserSpan = document.getElementById('current-user');
const courseModal = document.getElementById('course-modal');
const closeModalBtn = document.querySelector('.close-modal');
const modalCourseTitle = document.getElementById('modal-course-title');
const modalCourseDesc = document.getElementById('modal-course-desc');
const reviewText = document.getElementById('review-text');
const submitReviewBtn = document.getElementById('submit-review');
const stars = document.querySelectorAll('.star');
const ratingValue = document.getElementById('rating-value');
const reviewsContainer = document.getElementById('reviews-container');

// 加载时检查本地是否有登录令牌
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        fetchCurrentUser(token);
    } else {
        updateUserUI();
    }
    loadCourses();
});

// 获取当前登录用户信息
async function fetchCurrentUser(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            updateUserUI();
        } else {
            // 令牌失效
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            currentUser = null;
            updateUserUI();
        }
    } catch (error) {
        console.error('获取用户信息失败:', error);
    }
}

// 更新用户界面
function updateUserUI() {
    if (currentUser) {
        document.querySelector('.login-section').style.display = 'none';
        userWelcome.style.display = 'block';
        currentUserSpan.textContent = `${currentUser.username} (${currentUser.role === 'admin' ? '管理员' : '学生'})`;
    } else {
        document.querySelector('.login-section').style.display = 'flex';
        userWelcome.style.display = 'none';
    }
}

// 加载课程列表
async function loadCourses() {
    try {
        const response = await fetch(`${API_BASE_URL}/courses?page=${currentPage}&limit=${coursesPerPage}&search=${encodeURIComponent(searchInput.value.trim())}`);
        const data = await response.json();
        
        if (response.ok) {
            renderCourses(data.courses, data.pagination);
        } else {
            alert('加载课程失败: ' + data.error);
        }
    } catch (error) {
        console.error('加载课程出错:', error);
        alert('网络错误，请稍后重试');
    }
}

// 渲染课程卡片
function renderCourses(courses, pagination) {
    coursesContainer.innerHTML = '';
    
    if (courses.length === 0) {
        coursesContainer.innerHTML = '<p class="no-courses">未找到相关课程</p>';
    } else {
        courses.forEach(course => {
            const courseCard = document.createElement('div');
            courseCard.className = 'course-card';
            courseCard.innerHTML = `
                <div class="course-image">
                    <i class="fas fa-book"></i>
                </div>
                <div class="course-content">
                    <h3 class="course-title">${course.title}</h3>
                    <p class="course-info">${course.description}</p>
                    <div class="course-stats">
                        <span><i class="fas fa-star"></i> ${parseFloat(course.avg_rating).toFixed(1)}</span>
                        <span><i class="fas fa-comment"></i> ${course.review_count} 评价</span>
                        <span><i class="fas fa-thumbs-up"></i> ${course.total_likes}</span>
                    </div>
                </div>
            `;
            
            courseCard.addEventListener('click', () => openCourseModal(course.id));
            coursesContainer.appendChild(courseCard);
        });
    }
    
    updatePagination(pagination);
}

// 更新分页信息
function updatePagination(pagination) {
    currentPage = pagination.page;
    const totalPages = pagination.totalPages;
    currentPageSpan.textContent = currentPage;
    totalPagesSpan.textContent = totalPages;
    
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
}

// 打开课程详情模态框
async function openCourseModal(courseId) {
    if (!currentUser) {
        alert('请先登录再查看课程详情！');
        return;
    }
    
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        
        if (response.ok) {
            currentCourseId = courseId;
            modalCourseTitle.textContent = data.course.title;
            modalCourseDesc.textContent = data.course.description;
            
            // 渲染评价
            renderReviews(data.reviews);
            
            // 重置表单
            reviewText.value = '';
            currentRating = 0;
            updateRatingDisplay();
            
            courseModal.style.display = 'block';
        } else {
            alert('获取课程详情失败: ' + data.error);
        }
    } catch (error) {
        console.error('打开课程详情出错:', error);
        alert('网络错误，请稍后重试');
    }
}

// 渲染评价列表
function renderReviews(reviews) {
    reviewsContainer.innerHTML = '';
    
    if (reviews.length === 0) {
        reviewsContainer.innerHTML = '<p class="no-reviews">暂无评价，成为第一个评价的人吧！</p>';
        return;
    }
    
    reviews.forEach(review => {
        const reviewItem = document.createElement('div');
        reviewItem.className = 'review-item';
        reviewItem.innerHTML = `
            <div class="review-header">
                <span class="review-user">${review.username} ${review.user_id === currentUser?.id ? '<small>(我)</small>' : ''}</span>
                <span class="review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</span>
            </div>
            <div class="review-content">${review.content}</div>
            <div class="review-footer">
                <span class="review-date">${new Date(review.created_at).toLocaleDateString('zh-CN')}</span>
                <div>
                    ${currentUser?.role === 'admin' || review.user_id === currentUser?.id ? 
                        `<button class="delete-review-btn" data-review-id="${review.id}">删除</button>` : ''}
                    <button class="like-btn ${review.user_liked ? 'liked' : ''}" 
                            data-review-id="${review.id}"
                            data-liked="${review.user_liked}">
                        <i class="fas fa-thumbs-up"></i> <span class="like-count">${review.likes}</span>
                    </button>
                </div>
            </div>
        `;
        
        reviewsContainer.appendChild(reviewItem);
    });
    
    // 添加点赞事件监听
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const reviewId = parseInt(this.getAttribute('data-review-id'));
            const isLiked = this.getAttribute('data-liked') === '1';
            toggleLike(reviewId, isLiked);
        });
    });
    
    // 添加删除事件监听 (仅管理员和评价作者可见)
    document.querySelectorAll('.delete-review-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const reviewId = parseInt(this.getAttribute('data-review-id'));
            if (confirm('确定要删除这条评价吗？此操作不可恢复。')) {
                deleteReview(reviewId);
            }
        });
    });
}

// 点赞/取消点赞
async function toggleLike(reviewId, isLiked) {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/reviews/${reviewId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: isLiked ? 'unlike' : 'like'
            })
        });
        const data = await response.json();
        
        if (response.ok) {
            // 重新加载评价列表
            await reloadReviews();
        } else {
            alert('操作失败: ' + data.error);
        }
    } catch (error) {
        console.error('点赞操作出错:', error);
        alert('网络错误，请稍后重试');
    }
}

// 删除评价
async function deleteReview(reviewId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/reviews/${reviewId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        
        if (response.ok) {
            alert('评价删除成功');
            // 重新加载评价列表
            await reloadReviews();
        } else {
            alert('删除失败: ' + data.error);
        }
    } catch (error) {
        console.error('删除评价出错:', error);
        alert('网络错误，请稍后重试');
    }
}

// 重新加载评价
async function reloadReviews() {
    const token = localStorage.getItem('token');
    if (!token || !currentCourseId) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/courses/${currentCourseId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        
        if (response.ok) {
            renderReviews(data.reviews);
        }
    } catch (error) {
        console.error('重新加载评价失败:', error);
    }
}

// 更新评分显示
function updateRatingDisplay() {
    stars.forEach(star => {
        const value = parseInt(star.getAttribute('data-value'));
        star.classList.toggle('active', value <= currentRating);
    });
    ratingValue.textContent = currentRating;
}

// 提交评价
async function submitReview() {
    if (!reviewText.value.trim()) {
        alert('请输入评价内容！');
        return;
    }
    
    if (currentRating === 0) {
        alert('请选择评分！');
        return;
    }
    
    const token = localStorage.getItem('token');
    if (!token) {
        alert('请先登录！');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/courses/${currentCourseId}/reviews`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rating: currentRating,
                content: reviewText.value.trim()
            })
        });
        const data = await response.json();
        
        if (response.ok) {
            alert('评价提交成功！');
            // 重置表单
            reviewText.value = '';
            currentRating = 0;
            updateRatingDisplay();
            // 重新加载评价列表
            await reloadReviews();
        } else {
            alert('提交失败: ' + data.error);
        }
    } catch (error) {
        console.error('提交评价出错:', error);
        alert('网络错误，请稍后重试');
    }
}

// 搜索课程
function searchCourses() {
    currentPage = 1;
    loadCourses();
}

// 登录/注册处理
async function handleLogin() {
    const username = usernameInput.value.trim();
    const password = prompt('请输入密码（用于注册/登录）:');
    
    if (!username || !password) {
        alert('用户名和密码不能为空！');
        return;
    }
    
    // 首先尝试登录
    try {
        const loginResponse = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (loginResponse.ok) {
            const data = await loginResponse.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            currentUser = data.user;
            updateUserUI();
            usernameInput.value = '';
            alert('登录成功！');
            return;
        }
    } catch (error) {
        console.error('登录出错:', error);
    }
    
    // 登录失败则尝试注册
    if (confirm('用户不存在，是否要注册新用户？')) {
        try {
            const registerResponse = await fetch(`${API_BASE_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            if (registerResponse.ok) {
                alert('注册成功！请重新登录。');
                // 注册后自动登录
                const loginResponse = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                if (loginResponse.ok) {
                    const data = await loginResponse.json();
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('currentUser', JSON.stringify(data.user));
                    currentUser = data.user;
                    updateUserUI();
                    usernameInput.value = '';
                }
            } else {
                const errorData = await registerResponse.json();
                alert('注册失败: ' + errorData.error);
            }
        } catch (error) {
            console.error('注册出错:', error);
            alert('网络错误，请稍后重试');
        }
    }
}

// 事件监听器
loginBtn.addEventListener('click', handleLogin);

// 搜索
searchBtn.addEventListener('click', searchCourses);
searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') searchCourses();
});

// 显示所有课程
showAllBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentPage = 1;
    loadCourses();
    showAllBtn.classList.add('active');
    sortPopularBtn.classList.remove('active');
});

// 分页控制
prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        loadCourses();
    }
});

nextPageBtn.addEventListener('click', () => {
    const totalPages = parseInt(totalPagesSpan.textContent);
    if (currentPage < totalPages) {
        currentPage++;
        loadCourses();
    }
});

// 评分星星
stars.forEach(star => {
    star.addEventListener('click', () => {
        currentRating = parseInt(star.getAttribute('data-value'));
        updateRatingDisplay();
    });
    
    star.addEventListener('mouseover', () => {
        const value = parseInt(star.getAttribute('data-value'));
        stars.forEach(s => {
            const sValue = parseInt(s.getAttribute('data-value'));
            s.classList.toggle('active', sValue <= value);
        });
    });
    
    star.addEventListener('mouseout', () => {
        updateRatingDisplay();
    });
});

// 提交评价
submitReviewBtn.addEventListener('click', submitReview);

// 关闭模态框
closeModalBtn.addEventListener('click', () => {
    courseModal.style.display = 'none';
});

// 点击模态框外部关闭
window.addEventListener('click', (e) => {
    if (e.target === courseModal) {
        courseModal.style.display = 'none';
    }
});