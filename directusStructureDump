#!/bin/bash
DATABASE_NAME="satirev"
echo -n 'Directus database password (user satirev): '
read -s directus_password
echo
echo 'Attempting to fetch SQL dump'
echo 
# Drop entries?
ssh jacob@138.197.226.172 "mysqldump -p$directus_password -h localhost -u satirev $DATABASE_NAME articles categories > directus_structure.sql && if ! [[ -s directus_structure.sql ]]; then echo 'Database dump is empty' > stderr exit 1; fi; exit;"
if [[ "$?" -ne "0" ]]; then
    exit 1
fi
echo 'Database dumped. Copying from server.'
echo
sleep 2
scp jacob@138.197.226.172:~/directus_structure.sql ./
if [[ "$?" -ne "0" ]]; then
    exit 1
fi
echo 'Done!'