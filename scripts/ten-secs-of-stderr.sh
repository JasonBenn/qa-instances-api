counter=1
while [ $counter -le 10 ]; do
  sleep .3
  echo $counter 1>&2
  ((counter++))
done