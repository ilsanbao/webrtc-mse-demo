#!/bin/bash

cd $(dirname ${0})
progress=$(wget -O mydata4vipday2.datx.bak 'http://ipfile.galaxyclouds.cn/mydata4vipday2.datx' --http-user=backend --http-password=yuchengzhen 2>&1)

[[ "$progress" =~ "100%" ]] && {
    mv mydata4vipday2.datx.bak mydata4vipday2.datx
    echo "get mydata4vipday2.datx @ $(date +'%T %F')"
}

