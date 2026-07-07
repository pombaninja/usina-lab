-- Limites server-side para o bucket de notas fiscais (o front já valida, mas o
-- servidor precisa recusar por conta própria caso a validação client-side seja contornada).
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/heic','application/pdf']
where id = 'notas-fiscais';
