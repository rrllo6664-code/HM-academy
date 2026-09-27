import { supabase } from "./supabase.js";

var currentUser;
var courses = [];
var selectedCourseId = null;

async function logoutUser() {
    await supabase.auth.signOut();
    window.location.replace("Login.html");
}

function showStatus(message, state) {
    var status = document.getElementById('statusMessage');
    status.textContent = message;
    status.className = 'status-message visible ' + state;
}

function errorMessage(error) {
    var message = error && error.message ? error.message : String(error);
    if (/could not find the table ['"]?public\.courses['"]? in the schema cache/i.test(message)
        || /relation ['"]?public\.courses['"]? does not exist/i.test(message)) {
        return 'جدول الدورات غير موجود في قاعدة البيانات المرتبطة. نفّذ supabase-setup.sql أولًا ثم supabase-courses-migration.sql في SQL Editor لمشروع Supabase نفسه، وبعدها أعد تحميل الصفحة.';
    }
    if (/bucket not found/i.test(message)) {
        return 'مخزن صور الأغلفة غير مهيأ. شغّل supabase-courses-migration.sql في Supabase، أو أنشئ الدورة بدون صورة.';
    }
    if (/row-level security|permission denied|not allowed/i.test(message)) {
        return 'رفضت صلاحيات Supabase العملية. تأكد أن حسابك يحمل دور admin وأن ترحيل قاعدة البيانات مطبق.';
    }
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
        return 'تعذر الاتصال بـ Supabase. تحقق من الإنترنت وإعدادات المشروع ثم أعد المحاولة.';
    }
    return message;
}

function activateTab(tabName) {
    document.querySelectorAll('[data-admin-tab]').forEach(function(button) {
        var selected = button.dataset.adminTab === tabName;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    document.querySelectorAll('[data-admin-panel]').forEach(function(panel) {
        var selected = panel.dataset.adminPanel === tabName;
        panel.hidden = !selected;
        panel.classList.toggle('active', selected);
    });

    var pageTitles = {
        courses: ['إدارة الدورات', 'أنشئ دورة جديدة أو تابع محتوى أكاديميتك.', 'أهلًا بك، أستاذنا'],
        lessons: ['إدارة الدروس', 'أضف دروس الفيديو إلى الدورة المناسبة.', 'كل فكرة تستحق درسًا.']
    };
    document.getElementById('adminPageTitle').textContent = pageTitles[tabName][0];
    document.getElementById('adminPageSubtitle').textContent = pageTitles[tabName][1];
    document.getElementById('adminHeading').textContent = pageTitles[tabName][2];
    document.getElementById('statusMessage').className = 'status-message';
}

function makeActivationCode() {
    var bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var value = Array.from(bytes, function(byte) { return alphabet[byte % alphabet.length]; }).join('');
    return value.match(/.{1,4}/g).join('-');
}

function resetOptions(select, placeholder) {
    select.replaceChildren();
    var option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    option.disabled = true;
    option.selected = true;
    select.appendChild(option);
}

function syncCourseSelectors() {
    var lessonCourse = document.getElementById('lessonCourse');
    var lessonFilter = document.getElementById('lessonFilterCourse');
    resetOptions(lessonCourse, 'اختر دورة');
    resetOptions(lessonFilter, 'اختر دورة');

    courses.forEach(function(course) {
        [lessonCourse, lessonFilter].forEach(function(select) {
            var option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.title;
            select.appendChild(option);
        });
    });

    if (courses.length) {
        lessonCourse.value = String(courses[0].id);
        lessonFilter.value = String(courses[0].id);
    }
    lessonCourse.disabled = courses.length === 0;
    lessonFilter.disabled = courses.length === 0;
    document.getElementById('lessonCourseHint').textContent = courses.length
        ? 'سيظهر هذا الدرس للطلاب المسجلين في الدورة.'
        : 'أنشئ دورة أولًا لتتمكن من إضافة درس.';
    document.getElementById('courseListCount').textContent = courses.length;
}

function extractYouTubeEmbedUrl(value) {
    var url;
    try {
        url = new URL(value);
    } catch (error) {
        throw new Error('أدخل رابط YouTube صالحاً.');
    }

    var host = url.hostname.toLowerCase().replace(/^www\./, '');
    var videoId = '';
    if (host === 'youtu.be') {
        videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        if (url.pathname === '/watch') {
            videoId = url.searchParams.get('v') || '';
        } else {
            var pathParts = url.pathname.split('/').filter(Boolean);
            if (['embed', 'shorts', 'live'].includes(pathParts[0])) {
                videoId = pathParts[1] || '';
            }
        }
    }

    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        throw new Error('تعذر استخراج معرّف الفيديو من رابط YouTube.');
    }
    return 'https://www.youtube.com/embed/' + videoId;
}

async function loadCourses() {
    var result = await supabase.from('courses')
        .select('id, title, description, cover_url, published, created_at')
        .order('created_at', { ascending: false });
    if (result.error) throw result.error;

    courses = result.data || [];
    document.getElementById('totalCoursesCount').textContent = courses.length;
    document.getElementById('teacherCourseCount').textContent = courses.length;
    syncCourseSelectors();
    await renderCourseCards();
    await loadLessonCount();

    if (selectedCourseId && !courses.some(function(course) { return String(course.id) === String(selectedCourseId); })) {
        selectedCourseId = null;
        document.getElementById('courseToolsPanel').hidden = true;
    }
}

async function loadLessonCount() {
    var result = await supabase.from('lessons').select('id', { count: 'exact', head: true });
    if (result.error) throw result.error;
    document.getElementById('totalLessonsCount').textContent = result.count || 0;
}

async function renderCourseCards() {
    var list = document.getElementById('teacherCoursesList');
    list.replaceChildren();
    if (!courses.length) {
        var empty = document.createElement('p');
        empty.className = 'empty-msg';
        empty.textContent = 'لم تضف أي دورة بعد.';
        list.appendChild(empty);
        return;
    }

    for (var course of courses) {
        var enrollmentResult = await supabase.from('enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', course.id);
        if (enrollmentResult.error) throw enrollmentResult.error;

        var card = document.createElement('article');
        card.className = 'teacher-course-card';
        card.classList.toggle('selected', String(course.id) === String(selectedCourseId));
        var image = document.createElement(course.cover_url ? 'img' : 'div');
        if (course.cover_url) {
            image.src = course.cover_url;
            image.alt = '';
        } else {
            image.className = 'teacher-course-cover-placeholder';
            image.setAttribute('aria-hidden', 'true');
        }
        image.loading = 'lazy';
        var content = document.createElement('div');
        content.className = 'teacher-course-content';
        var title = document.createElement('h3');
        title.textContent = course.title;
        var description = document.createElement('p');
        description.textContent = course.description;
        var meta = document.createElement('div');
        meta.className = 'teacher-course-meta';
        meta.textContent = 'عدد الطلاب: ' + (enrollmentResult.count || 0);
        var manage = document.createElement('button');
        manage.className = 'btn-secondary';
        manage.type = 'button';
        manage.textContent = 'الرموز والدروس';
        manage.addEventListener('click', async function(courseRecord) {
            return async function() {
                try {
                    await selectCourse(courseRecord);
                } catch (error) {
                    showStatus('تعذر فتح أدوات الدورة: ' + errorMessage(error), 'error');
                }
            };
        }(course));
        content.append(title, description, meta, manage);
        card.append(image, content);
        list.appendChild(card);
    }
}

async function selectCourse(course) {
    selectedCourseId = course.id;
    document.getElementById('courseToolsPanel').hidden = false;
    document.getElementById('managedCourseTitle').textContent = 'رموز دورة ' + course.title;
    document.getElementById('newCodeReveal').hidden = true;
    document.getElementById('lessonFilterCourse').value = String(course.id);
    document.getElementById('lessonCourse').value = String(course.id);
    await renderCourseCards();
    await renderActivationCodes();
    await renderAdminLessons(course.id);
    activateTab('courses');
}

async function renderActivationCodes() {
    var list = document.getElementById('activationCodesList');
    list.replaceChildren();
    var result = await supabase.from('course_activation_codes')
        .select('id, issued_at, redeemed_at, redeemed_by')
        .eq('course_id', selectedCourseId)
        .order('issued_at', { ascending: false });
    if (result.error) throw result.error;

    if (!result.data.length) {
        var empty = document.createElement('p');
        empty.className = 'empty-msg';
        empty.textContent = 'لم تصدر رموزاً لهذه الدورة بعد.';
        list.appendChild(empty);
        return;
    }

    result.data.forEach(function(code) {
        var row = document.createElement('div');
        row.className = 'activation-code-row';
        var status = document.createElement('span');
        status.className = code.redeemed_at ? 'code-status used' : 'code-status ready';
        status.textContent = code.redeemed_at ? 'مستخدم' : 'صالح للاستخدام';
        var date = document.createElement('time');
        date.dateTime = code.issued_at;
        date.textContent = new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date(code.issued_at));
        row.append(status, date);
        list.appendChild(row);
    });
}

async function renderAdminLessons(courseId) {
    var list = document.getElementById('adminLessonsList');
    list.replaceChildren();
    if (!courseId) {
        list.textContent = 'اختر دورة لعرض دروسها.';
        return;
    }
    var result = await supabase.from('lessons')
        .select('id, title, description, video_url')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });
    if (result.error) throw result.error;

    if (!result.data.length) {
        list.textContent = 'لا توجد دروس مرتبطة بهذه الدورة.';
        return;
    }
    result.data.forEach(function(lesson) {
        var row = document.createElement('article');
        row.className = 'lesson-item';
        var info = document.createElement('div');
        info.className = 'lesson-info';
        var title = document.createElement('h4');
        title.textContent = lesson.title;
        var description = document.createElement('p');
        description.textContent = lesson.description;
        info.append(title, description);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-delete';
        remove.title = 'حذف الدرس';
        remove.setAttribute('aria-label', 'حذف ' + lesson.title);
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>';
        remove.addEventListener('click', async function() {
            var deletion = await supabase.from('lessons').delete().eq('id', lesson.id);
            if (deletion.error) {
                showStatus('تعذر حذف الدرس: ' + deletion.error.message, 'error');
                return;
            }
            await renderAdminLessons(courseId);
            showStatus('تم حذف الدرس.', 'success');
        });
        row.append(info, remove);
        list.appendChild(row);
    });
}

async function uploadCourseCover(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new Error('اختر صورة بصيغة JPG أو PNG أو WebP.');
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('يجب أن يكون حجم الصورة أقل من 5 ميغابايت.');
    var safeExtension = file.type.split('/')[1].replace('jpeg', 'jpg');
    var path = currentUser.id + '/' + crypto.randomUUID() + '.' + safeExtension;
    var uploaded = await supabase.storage.from('course-covers').upload(path, file, { upsert: false });
    if (uploaded.error) throw uploaded.error;
    return supabase.storage.from('course-covers').getPublicUrl(path).data.publicUrl;
}

function bindForms() {
    document.querySelectorAll('[data-admin-tab]').forEach(function(button) {
        button.addEventListener('click', function() { activateTab(button.dataset.adminTab); });
    });
    document.getElementById('logoutBtn').addEventListener('click', logoutUser);
    document.getElementById('currentDateLabel').textContent = new Intl.DateTimeFormat('ar', {
        dateStyle: 'long'
    }).format(new Date());

    var coverInput = document.getElementById('courseCover');
    var courseForm = document.getElementById('addCourseForm');
    courseForm.addEventListener('invalid', function(event) {
        var message = event.target === coverInput
            ? 'اختر صورة غلاف للدورة قبل إنشائها.'
            : 'أدخل اسم الدورة ووصفها قبل الإنشاء.';
        showStatus(message, 'error');
    }, true);

    coverInput.addEventListener('change', function() {
        var preview = document.getElementById('courseCoverPreview');
        if (!coverInput.files[0]) {
            document.getElementById('coverFileLabel').textContent = 'اختر صورة من جهازك';
            preview.hidden = true;
            preview.removeAttribute('src');
            return;
        }
        document.getElementById('coverFileLabel').textContent = coverInput.files[0].name;
        preview.src = URL.createObjectURL(coverInput.files[0]);
        preview.hidden = false;
    });

    courseForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        var form = event.currentTarget;
        var button = form.querySelector('[type="submit"]');
        var buttonLabel = button.querySelector('span');
        var originalButtonText = buttonLabel.textContent;
        var savedCourse = false;
        button.disabled = true;
        buttonLabel.textContent = 'جارٍ إنشاء الدورة...';
        showStatus(coverInput.files[0] ? 'جارٍ رفع الغلاف وحفظ الدورة...' : 'جارٍ حفظ الدورة...', 'info');
        try {
            var coverUrl = coverInput.files[0] ? await uploadCourseCover(coverInput.files[0]) : null;
            var result = await supabase.from('courses').insert({
                title: document.getElementById('courseTitle').value.trim(),
                description: document.getElementById('courseDescription').value.trim(),
                cover_url: coverUrl,
                created_by: currentUser.id
            }).select('id').single();
            if (result.error) throw result.error;
            savedCourse = true;
            form.reset();
            document.getElementById('courseCoverPreview').hidden = true;
            document.getElementById('coverFileLabel').textContent = 'اختر صورة من جهازك';
            await loadCourses();
            var createdCourse = courses.find(function(course) { return String(course.id) === String(result.data.id); });
            if (createdCourse) await selectCourse(createdCourse);
            showStatus('تم إنشاء الدورة. يمكنك الآن إضافة الدروس وإصدار رموز التفعيل.', 'success');
        } catch (error) {
            showStatus(savedCourse
                ? 'تم إنشاء الدورة، لكن تعذر تحديث بقية البيانات: ' + errorMessage(error)
                : 'تعذر إنشاء الدورة: ' + errorMessage(error), 'error');
        } finally {
            button.disabled = false;
            buttonLabel.textContent = originalButtonText;
        }
    });

    var lessonForm = document.getElementById('addLessonForm');
    lessonForm.addEventListener('invalid', function(event) {
        showStatus(event.target.id === 'lessonCourse' && !courses.length
            ? 'أنشئ دورة أولًا لتتمكن من نشر درس.'
            : 'أكمل حقول الدرس المطلوبة قبل النشر.', 'error');
    }, true);
    lessonForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        var form = event.currentTarget;
        var courseId = document.getElementById('lessonCourse').value;
        if (!courseId) {
            showStatus('أنشئ دورة أولاً ثم أضف الدروس إليها.', 'error');
            return;
        }
        var submitButton = form.querySelector('[type="submit"]');
        var submitLabel = submitButton.querySelector('span');
        var originalSubmitText = submitLabel.textContent;
        submitButton.disabled = true;
        submitLabel.textContent = 'جارٍ نشر الدرس...';
        showStatus('جارٍ حفظ الدرس في الدورة المختارة...', 'info');
        try {
            var formattedUrl = extractYouTubeEmbedUrl(document.getElementById('videoUrl').value.trim());
            var result = await supabase.from('lessons').insert({
                title: document.getElementById('lessonTitle').value.trim(),
                description: document.getElementById('lessonDesc').value.trim(),
                video_url: formattedUrl,
                course_id: Number(courseId),
                created_by: currentUser.id
            });
            if (result.error) throw result.error;
            form.reset();
            await renderAdminLessons(courseId);
            await loadLessonCount();
            showStatus('تم نشر الدرس داخل الدورة.', 'success');
        } catch (error) {
            showStatus('تعذر نشر الدرس: ' + errorMessage(error), 'error');
        } finally {
            submitButton.disabled = false;
            submitLabel.textContent = originalSubmitText;
        }
    });

    document.getElementById('lessonFilterCourse').addEventListener('change', function(event) {
        renderAdminLessons(event.target.value).catch(function(error) {
            showStatus('تعذر تحميل الدروس: ' + errorMessage(error), 'error');
        });
    });

    document.getElementById('issueCodeBtn').addEventListener('click', async function(event) {
        var button = event.currentTarget;
        button.disabled = true;
        var code = makeActivationCode();
        try {
            var result = await supabase.rpc('issue_course_activation_code', {
                p_course_id: selectedCourseId,
                p_code: code
            });
            if (result.error) throw result.error;
            document.getElementById('newCodeValue').textContent = code;
            document.getElementById('newCodeReveal').hidden = false;
            await renderActivationCodes();
            showStatus('صدر الرمز. انسخه الآن وأرسله لطالب واحد؛ لن يُعرض مرة أخرى.', 'success');
        } catch (error) {
            showStatus('تعذر إصدار الرمز: ' + errorMessage(error), 'error');
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('copyCodeBtn').addEventListener('click', async function() {
        var code = document.getElementById('newCodeValue').textContent;
        try {
            await navigator.clipboard.writeText(code);
            showStatus('تم نسخ رمز التفعيل.', 'success');
        } catch (error) {
            showStatus('تعذر النسخ التلقائي؛ حدّد الرمز وانسخه يدوياً.', 'error');
        }
    });
}

async function initializeTeacherDashboard() {
    var sessionResult = await supabase.auth.getSession();
    if (sessionResult.error || !sessionResult.data.session) {
        window.location.replace('Login.html');
        return;
    }
    currentUser = sessionResult.data.session.user;
    var profileResult = await supabase.from('profiles').select('role').eq('id', currentUser.id).maybeSingle();
    if (profileResult.error || !profileResult.data || profileResult.data.role !== 'admin') {
        window.location.replace('index.html');
        return;
    }

    bindForms();
    try {
        await loadCourses();
        if (courses.length) await renderAdminLessons(courses[0].id);
    } catch (error) {
        showStatus('تعذر تحميل بيانات الإدارة: ' + error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', initializeTeacherDashboard);
