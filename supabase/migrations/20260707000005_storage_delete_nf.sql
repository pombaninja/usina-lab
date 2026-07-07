-- Permite ao lançador de insumos remover anexos do bucket notas-fiscais
-- (necessário para a limpeza de arquivo órfão quando o insert da entrada falha)
create policy nf_delete on storage.objects for delete
  using (bucket_id = 'notas-fiscais' and tem_papel('insumos', array['lancador','avaliador','admin']));
