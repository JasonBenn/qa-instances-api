# Easily switch between using picasso.conf and local.conf (they conflict with each other).

SITES=/usr/local/etc/nginx/sites-enabled

echo "sites-enabled before:"
ls $SITES

function reportAndQuit {
  sudo nginx -s reload
  echo
  echo "sites-enabled after:"
  ls $SITES
  echo
  echo "nginx reloaded"
  echo
  exit 0
}

# If both local.conf and picasso.conf are present, toggle which one is active.
if [[ -f $SITES/picasso.conf && -f $SITES/local.conf.noconflict ]]; then
  mv $SITES/picasso.conf $SITES/picasso.conf.noconflict
  mv $SITES/local.conf.noconflict $SITES/local.conf
  reportAndQuit
fi

if [[ -f $SITES/picasso.conf.noconflict && -f $SITES/local.conf ]]; then
  mv $SITES/picasso.conf.noconflict $SITES/picasso.conf
  mv $SITES/local.conf $SITES/local.conf.noconflict
  reportAndQuit
fi

Or, if this script has never been run before:
if [[ -f $SITES/picasso.conf && -f $SITES/local.conf ]]; then
  mv $SITES/picasso.conf $SITES/picasso.conf.noconflict
fi
reportAndQuit
