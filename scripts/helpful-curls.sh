# Local
curl -XPOST localhost:3000/pulls -H "Content-Type: application/json" --data '{"prId":"3"}'; echo
curl localhost:3000/pulls/3; echo

# Production
curl -XPOST 34.210.27.83/pulls -H "Content-Type: application/json" --data '{"prId":"3"}'; echo
curl 34.210.27.83/pulls/3; echo