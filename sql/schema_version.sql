CREATE TABLE IF NOT EXISTS public.schema_version
(
    id SERIAL PRIMARY KEY,
    version VARCHAR(20) NOT NULL
);

INSERT INTO public.schema_version (version)
VALUES ('1.0.0');
