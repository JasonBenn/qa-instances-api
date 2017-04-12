curl -XPOST localhost:3000/pulls -H "Content-Type: application/json" --data '{"prId":"3"}'; echo
curl localhost:3000/pulls/3; echo