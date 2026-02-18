-- Fix "Function Search Path Mutable" (Security Fix)
-- This prevents malicious code from hijacking the function logic.
ALTER FUNCTION public.update_modified_column() SET search_path = '';