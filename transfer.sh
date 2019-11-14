#!/bin/bash
DRUPAL_DATABASE="satirevdrupal"
DIRECTUS_DATABASE="satirev"

export_drupal() {
  echo -n 'Drupal database password (user satirevdrupal): '
  read -s drupal_password
  echo
  echo 'Attempting to fetch SQL dump'
  echo
  ssh -oHostKeyAlgorithms=+ssh-dss satirev@50.63.72.1 "mysqldump -p$drupal_password -h satirevdrupal.db.9044516.hostedresource.com -u satirevdrupal $DRUPAL_DATABASE node field_data_body field_data_field_caption field_data_field_category taxonomy_term_data taxonomy_vocabulary field_data_field_teaser field_data_field_year field_data_field_tags field_data_field_image file_managed url_alias > $DRUPAL_DATABASE.sql && if ! [[ -s $DRUPAL_DATABASE.sql ]]; then echo 'Database dump is empty' > stderr exit 1; fi; exit;"
  if [[ "$?" -ne "0" ]]; then
    exit 1
  fi
  echo 'Database dumped. Copying from server.'
  echo
  sleep 2
  scp -oHostKeyAlgorithms=+ssh-dss satirev@50.63.72.1:./$DRUPAL_DATABASE.sql ./
  if [[ "$?" -ne "0" ]]; then
    exit 1
  fi
  echo "Copied $DRUPAL_DATABASE.sql to local directory"
  echo
}

import_local() {
  echo 'Attempting to connect to locally running MySQL server as root'
  echo 'on localhost:3306'
  echo
  echo -n 'Local MySQL root password: '
  read -s local_password
  echo
  echo "Dropping current database, creating new one"
  echo
  mysql -u root -p$local_password -e "DROP SCHEMA IF EXISTS $1; CREATE DATABASE $1"
  mysql -u root -p$local_password $1<$2
  echo
}

import_directus() {
  echo -n 'Directus database password (user satirev): '
  read -s directus_password
  echo
  echo 'Copying import to server'
  echo
  scp ./import.sql jacob@138.197.226.172:~/import.sql
  ssh jacob@138.197.226.172 "mysql -p$directus_password -h localhost -u satirev $DIRECTUS_DATABASE < $1"
  if [[ "$?" -ne "0" ]]; then
    exit 1
  fi
  echo 'Import successful'
  echo
}

export_directus() {
  echo -n 'Directus database password (user satirev): '
  read -s directus_password
  echo
  echo 'Attempting to fetch SQL dump'
  echo
  # Drop entries?
  ssh jacob@138.197.226.172 "mysqldump -p$directus_password -h localhost -u satirev $DIRECTUS_DATABASE articles categories > $DIRECTUS_DATABASE.sql && if ! [[ -s $DIRECTUS_DATABASE.sql ]]; then echo 'Database dump is empty' > stderr exit 1; fi; exit;"
  if [[ "$?" -ne "0" ]]; then
    exit 1
  fi
  echo 'Database dumped. Copying from server.'
  echo
  sleep 2
  scp jacob@138.197.226.172:~/$DIRECTUS_DATABASE.sql ./
  if [[ "$?" -ne "0" ]]; then
    exit 1
  fi
  echo "Copied $DIRECTUS_DATABASE.sql to local directory"
  echo
}

usage() {
  echo "
  Imports or exports database to/from a source

  Usage: transfer -s <source> -a <action>

      -s | --source             directus, drupal, or local
      -a | --action             import or export
  "
}

invalid() {
  echo "That combination is not valid
  "
}
while [ "$1" != "" ]; do
  case $1 in
    -s | --source ) shift
      source=$1
    ;;
    -a | --action ) shift
      action=$1
    ;;
    -h | --help ) usage
      exit
    ;;
    * ) usage
      exit 1
  esac
  shift
done
case $source in
  "directus" )
    if [ "$action" == "import" ]; then
      echo -n "SQL file to import to directus: "
      read dir_database_sql
      echo
      import_directus $dir_database_sql
      elif [ "$action" == "export" ]; then
      export_directus
    else
      usage
    fi
  ;;
  "drupal")
    if [ "$action" == "export" ]; then
      export_drupal
    else
      usage invalid
    fi
  ;;
  "local")
    if [ "$action" == "import" ]; then
      echo -n "Database name: "
      read local_database_name
      echo -n "SQL file to import to local: "
      read local_database_sql
      import_local $local_database_name $local_database_sql
    else
      usage invalid
    fi
  ;;
  *)
    usage
  ;;
esac
echo "Done"
