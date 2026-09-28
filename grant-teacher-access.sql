do $$
declare
    target_user_id uuid;
begin
    select id
    into target_user_id
    from auth.users
    where email = 'rrllo6664@gmail.com';

    if target_user_id is null then
        raise exception 'No Supabase auth user found for rrllo6664@gmail.com';
    end if;

    insert into public.profiles (id, role)
    values (target_user_id, 'admin')
    on conflict (id) do update
    set role = 'admin';
end;
$$;