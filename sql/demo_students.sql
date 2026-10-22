CREATE TABLE IF NOT EXISTS public.demo_students
(
    student_id INTEGER,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    course VARCHAR(100)/*,
    course_id VARCHAR(10) NOT NULL,

    PRIMARY KEY (student_id, course_id)*/
);