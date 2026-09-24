// التحقق من الصلاحيات: يجب أن يكون مسجلاً كـ Admin حصراً
if (localStorage.getItem("isLoggedIn") !== "true" || localStorage.getItem("userRole") !== "admin") {
    alert("عذراً، هذه الصفحة مخصصة لمدير النظام فقط!");
    window.location.href = "login.html";
}

// دالة تسجيل الخروج
function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html";
}

// بقية كود admin.js بدون تغيير...
// التحقق من حالة تسجيل الدخول عند تحميل الصفحة
if (localStorage.getItem("isLoggedIn") !== "true") {
    window.location.href = "login.html";
}

// دالة تسجيل الخروج
function logoutUser() {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userRole");
    window.location.href = "login.html";
}

// دالة استخراج رابط Embed الخاص بـ YouTube
function extractYouTubeEmbedUrl(url) {
    if (!url) return "";
    var videoId = "";
    
    if (url.indexOf("youtu.be/") !== -1) {
        videoId = url.split("youtu.be/")[1].split("?")[0];
    } else if (url.indexOf("watch?v=") !== -1) {
        videoId = url.split("watch?v=")[1].split("&")[0];
    } else if (url.indexOf("embed/") !== -1) {
        return url;
    }
    
    return videoId ? "https://www.youtube.com/embed/" + videoId : url;
}

// تنفيذ الأكواد بعد اكتمال تحميل عناصر الصفحة DOM
document.addEventListener('DOMContentLoaded', function() {
    
    // ربط زر تسجيل الخروج
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    // إدارة النموذج (إضافة درس جديد)
    var form = document.getElementById('addLessonForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            var title = document.getElementById('lessonTitle').value.trim();
            var desc = document.getElementById('lessonDesc').value.trim();
            var rawUrl = document.getElementById('videoUrl').value.trim();

            var formattedUrl = extractYouTubeEmbedUrl(rawUrl);

            var lessons = getStoredLessons();

            var newLesson = {
                id: new Date().getTime(),
                title: title,
                desc: desc,
                url: formattedUrl
            };

            lessons.push(newLesson);
            localStorage.setItem("h_m_lessons", JSON.stringify(lessons));

            // إعادة ضبط الحقول
            form.reset();

            // إعادة رسم القائمة
            renderAdminLessons();
            alert("تم إضافة الدرس بنجاح!");
        });
    }

    // عرض الدروس عند التحميل
    renderAdminLessons();
});

// دالة جلب الدروس المحفوظة
function getStoredLessons() {
    var savedData = localStorage.getItem("h_m_lessons");
    if (savedData) {
        try {
            return JSON.parse(savedData);
        } catch(err) {
            return [];
        }
    }
    return [];
}

// دالة حذف الدرس
function deleteLesson(id) {
    if (confirm("هل أنت تأكد من حذف هذا الدرس؟")) {
        var lessons = getStoredLessons();
        var updatedLessons = lessons.filter(function(lesson) {
            return lesson.id !== id;
        });

        localStorage.setItem("h_m_lessons", JSON.stringify(updatedLessons));
        renderAdminLessons();
    }
}

// دالة عرض وتحديث قائمة الدروس في الصفحة
function renderAdminLessons() {
    var listContainer = document.getElementById('adminLessonsList');
    var totalCounter = document.getElementById('totalLessonsCount');
    
    if (!listContainer || !totalCounter) return;

    var lessons = getStoredLessons();

    totalCounter.innerText = lessons.length;
    listContainer.innerHTML = "";

    if (lessons.length === 0) {
        listContainer.innerHTML = '<p class="empty-msg">لا توجد دروس منشورة حالياً.</p>';
        return;
    }

    lessons.forEach(function(lesson) {
        var itemDiv = document.createElement('div');
        itemDiv.className = 'lesson-item';

        var infoDiv = document.createElement('div');
        infoDiv.className = 'lesson-info';

        var h4 = document.createElement('h4');
        h4.textContent = lesson.title;

        var p = document.createElement('p');
        p.textContent = lesson.desc;

        infoDiv.appendChild(h4);
        infoDiv.appendChild(p);
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'حذف';
        deleteBtn.addEventListener('click', function() {
            deleteLesson(lesson.id);
        });

        itemDiv.appendChild(infoDiv);
        itemDiv.appendChild(deleteBtn);

        listContainer.appendChild(itemDiv);
    });
}