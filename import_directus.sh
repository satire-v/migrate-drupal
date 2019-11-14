#!/bin/bash
DATABASE_NAME="satirev"
echo -n 'Directus database password (user satirev): '
read -s directus_password
echo
echo 'Copying import to server'
echo
scp ./import.sql jacob@138.197.226.172:~/import.sql
ssh jacob@138.197.226.172 "mysql -p$directus_password -h localhost -u satirev $DATABASE_NAME < import.sql"
if [[ "$?" -ne "0" ]]; then
  exit 1
fi
echo 'Import successful'
echo